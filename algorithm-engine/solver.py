"""교대근무 스케줄 생성 엔진 (OR-Tools CP-SAT).

사용법: python solver.py sample_input.json > output.json
"""
import json
import re
import sys
from datetime import date, datetime, timedelta

from ortools.sat.python import cp_model

DEFAULT_RULES = {
    "max_weekly_hours": 52,
    "min_rest_hours": 11,
    "max_consecutive_days": 5,
    "undesirable_shifts": ["Closing", "Night"],
    "default_hourly_wage": 10320,
    "time_limit_seconds": 30,
}


def _min(hhmm):
    h, m = map(int, hhmm.split(":"))
    return h * 60 + m


def _window(sd):
    """시프트 (시작분, 종료분). 자정을 넘기면 종료에 24h 가산."""
    s, e = _min(sd["start"]), _min(sd["end"])
    return s, e if e > s else e + 1440


def _fits_slots(sd, slots):
    s, e = _window(sd)
    return any(_min(a) <= s and e <= _min(b) for a, b in (x.split("-") for x in slots))


def _week(d):
    return d.isocalendar()[:2]


def _rotation_workdays(days, rp, offset, leaves):
    """순환 패턴에서 offset 위상일 때 근무해야 하는 날짜 집합. 위상은 기간 시작일 기준."""
    cycle = rp["work_days"] + rp["off_days"]
    return {d for i, d in enumerate(days) if (i + offset) % cycle < rp["work_days"] and d.isoformat() not in leaves}


def _at(d, minutes):
    return datetime.combine(d, datetime.min.time()) + timedelta(minutes=minutes)


def _prior_end(e):
    """employees[].prior_last_shift_end 파싱. 없으면 None, 형식 오류면 ValueError.
    출력 last_shift_end와 같은 YYYY-MM-DDTHH:MM(오프셋 없는 현지 시각)만 허용해 carry 값의 형식을 보장."""
    v = e.get("prior_last_shift_end")
    if v is None:
        return None
    if not (isinstance(v, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}", v)):
        raise ValueError(v)
    return datetime.fromisoformat(v)  # 범위 오류(13월, 25시 등)는 ValueError


def _last_end(e, worked, shifts):
    """다음 기간 prior_last_shift_end로 넘길 값. 배정이 없으면 입력 prior 값을 그대로(없으면 None)."""
    if not worked:
        return e.get("prior_last_shift_end")
    return max(_at(d, _window(shifts[s])[1]) for d, s in worked.items()).isoformat(timespec="minutes")


def _cap(rules, e):
    return min(rules["max_weekly_hours"], e.get("max_weekly_hours", rules["max_weekly_hours"]))


def _trailing_week(days, worked, shifts, prior):
    """end_date 다음 날이 속한 ISO 주에서 end_date까지 이미 일한 시간 (end_date가 일요일이면 0).
    첫날이 그 주에 속하면 prior_week_hours 포함."""
    wk = _week(days[-1] + timedelta(1))
    return sum(shifts[s]["hours"] for d, s in worked.items() if _week(d) == wk) + (prior if _week(days[0]) == wk else 0)


def _trailing(days, worked, prior):
    """기간 마지막 날까지 이어진 연속 근무일수. 기간 전체가 근무면 이전 기간 연속분(prior)까지 합산."""
    run = next((k for k, d in enumerate(reversed(days)) if d not in worked), None)
    return len(days) + prior if run is None else run


def _fail(status, message):
    return {
        "status": status,
        "fairness_score": 0,
        "summary": {"total_shifts_assigned": 0, "legal_violations": 0, "estimated_labor_cost": 0},
        "schedules": [],
        "warnings_and_exceptions": [message],
    }


def solve(data):
    rules = {**DEFAULT_RULES, **data.get("rules", {})}
    p = data["schedule_period"]
    start, end = date.fromisoformat(p["start_date"]), date.fromisoformat(p["end_date"])
    days = [start + timedelta(i) for i in range((end - start).days + 1)]
    shifts = {k: v for k, v in data["shift_definitions"].items() if v.get("hours", 0) > 0}
    reqs = data["shift_requirements"]
    emps = data["employees"]
    undesirable = [s for s in shifts if s in rules["undesirable_shifts"]]

    # 순환 패턴 입력 검사: 연속 근무 상한과 모순되는 설정은 해를 찾기 전에 입력 오류로 거부
    rp = rules.get("rotation_pattern")
    if rp is not None:
        if not (isinstance(rp, dict) and all(type(rp.get(k)) is int and rp[k] >= 1 for k in ("work_days", "off_days"))):
            return _fail("INVALID_INPUT", "rotation_pattern의 work_days, off_days는 1 이상의 정수여야 합니다.")
        if rp["work_days"] > rules["max_consecutive_days"]:
            return _fail("INVALID_INPUT", f"rotation_pattern 근무 {rp['work_days']}일이 최대 연속 근무일 "
                                          f"{rules['max_consecutive_days']}일을 초과합니다.")
        cycle = rp["work_days"] + rp["off_days"]
        for e in emps:
            k = e.get("rotation_offset")
            if e.get("employment_type") == "Full_Time" and k is not None and not (type(k) is int and 0 <= k < cycle):
                return _fail("INVALID_INPUT", f"{e['id']} rotation_offset은 0~{cycle - 1} 정수여야 합니다.")

    # 이전 기간 연속 근무일수 입력 검사: 상한 초과는 이미 위반 상태이므로 입력 오류
    for e in emps:
        k = e.get("prior_consecutive_work_days", 0)
        if not (type(k) is int and 0 <= k <= rules["max_consecutive_days"]):
            return _fail("INVALID_INPUT", f"{e['id']} prior_consecutive_work_days는 "
                                          f"0~{rules['max_consecutive_days']} 정수여야 합니다.")
        try:
            _prior_end(e)
        except ValueError:
            return _fail("INVALID_INPUT", f"{e['id']} prior_last_shift_end는 YYYY-MM-DDTHH:MM 형식이어야 합니다.")
        # 시프트 hours가 정수(CP-SAT 계수)이므로 정수만. 상한 초과는 이미 위반 상태이므로 입력 오류
        h = e.get("prior_week_hours", 0)
        if not (type(h) is int and 0 <= h <= _cap(rules, e)):
            return _fail("INVALID_INPUT", f"{e['id']} prior_week_hours는 0~{_cap(rules, e)} 정수여야 합니다.")

    m = cp_model.CpModel()
    x = {}
    for e in emps:
        leaves = set(e.get("approved_leaves", []))
        slots = e.get("available_time_slots")
        for d in days:
            for s, sd in shifts.items():
                v = m.new_bool_var(f"{e['id']}_{d}_{s}")
                # Hard 4: 승인 휴가일 OFF 고정 / Soft 3: 파트타임은 가용 시간대 내에만
                if d.isoformat() in leaves or (slots and not _fits_slots(sd, slots)):
                    m.add(v == 0)
                x[e["id"], d, s] = v

    work = {}
    for e in emps:
        eid = e["id"]
        for d in days:
            work[eid, d] = sum(x[eid, d, s] for s in shifts)
            m.add(work[eid, d] <= 1)  # 하루 1시프트

        # Hard 1: 주당 최대 근로시간 (법정 상한과 계약 상한 중 작은 값). 첫 주는 기간 전 근무 시간 포함
        cap = _cap(rules, e)
        for wk in {_week(d) for d in days}:
            prior = e.get("prior_week_hours", 0) if wk == _week(days[0]) else 0
            m.add(sum(x[eid, d, s] * shifts[s]["hours"] for d in days if _week(d) == wk for s in shifts) + prior <= cap)

        # Hard 2: 연속 이틀 사이 최소 휴식 시간
        for d1, d2 in zip(days, days[1:]):
            for s1, sd1 in shifts.items():
                for s2, sd2 in shifts.items():
                    if 1440 + _window(sd2)[0] - _window(sd1)[1] < rules["min_rest_hours"] * 60:
                        m.add(x[eid, d1, s1] + x[eid, d2, s2] <= 1)
        # 기간 경계: 직전 근무 종료 시각부터 휴식이 부족한 시프트 금지 (첫날에 한정하지 않음)
        prior_end = _prior_end(e)
        if prior_end:
            for d in days:
                for s, sd in shifts.items():
                    if _at(d, _window(sd)[0]) - prior_end < timedelta(hours=rules["min_rest_hours"]):
                        m.add(x[eid, d, s] == 0)

        # Hard 3: 최대 연속 근무일수
        n = rules["max_consecutive_days"]
        for i in range(len(days) - n):
            m.add(sum(work[eid, d] for d in days[i:i + n + 1]) <= n)
        # 기간 경계: 직전 prior일 연속 근무를 이어받아 첫 n+1-prior일 중 최소 하루 휴무 (짧은 구간 창은 이 조건에 포함됨)
        prior = e.get("prior_consecutive_work_days", 0)
        if prior:
            m.add(sum(work[eid, d] for d in days[:n + 1 - prior]) <= n - prior)

    # Hard 5: 필수 인원 및 시니어 포함
    seniors = [e["id"] for e in emps if e.get("level") == "Senior"]
    for d in days:
        for s, r in reqs.items():
            if s not in shifts:
                continue
            m.add(sum(x[e["id"], d, s] for e in emps) >= r.get("min_count", 0))
            m.add(sum(x[eid, d, s] for eid in seniors) >= r.get("min_senior", 0))

    # Soft 2: 기피 시프트·주말 근무 균등 분배 (풀타임 대상, 최대-최소 편차 최소화)
    ft = [e["id"] for e in emps if e.get("employment_type") == "Full_Time"]

    # Hard 6: 순환 패턴 (풀타임 대상). 위상은 입력 rotation_offset으로 고정하거나 솔버가 선택,
    # 근무일 1시프트·휴무일 0 (휴가 우선)
    offsets = {}
    if rp is not None:
        emp_of = {e["id"]: e for e in emps}
        for eid in ft:
            ys = [m.new_bool_var(f"{eid}_offset{k}") for k in range(rp["work_days"] + rp["off_days"])]
            m.add_exactly_one(ys)
            if emp_of[eid].get("rotation_offset") is not None:
                m.add(ys[emp_of[eid]["rotation_offset"]] == 1)
            for k, y in enumerate(ys):
                on = _rotation_workdays(days, rp, k, set(emp_of[eid].get("approved_leaves", [])))
                for d in days:
                    m.add(work[eid, d] == int(d in on)).only_enforce_if(y)
            offsets[eid] = ys

    spreads = []
    for name, cells in (
        ("undesirable", [(d, s) for d in days for s in undesirable]),
        ("weekend", [(d, s) for d in days if d.weekday() >= 5 for s in shifts]),
    ):
        if not ft or not cells:
            continue
        counts = [sum(x[eid, d, s] for d, s in cells) for eid in ft]
        hi, lo = m.new_int_var(0, len(cells), f"{name}_hi"), m.new_int_var(0, len(cells), f"{name}_lo")
        m.add_max_equality(hi, counts)
        m.add_min_equality(lo, counts)
        spreads.append((name, hi - lo))

    pref = [x[e["id"], d, e["preferences"]["preferred_shift"]]
            for e in emps if e.get("preferences", {}).get("preferred_shift") in shifts for d in days]
    # 가중치: 공정성 > 인건비(과잉 배치 억제) > 선호 반영
    m.minimize(20 * sum(sp for _, sp in spreads) + 3 * sum(x.values()) - 2 * sum(pref))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = rules["time_limit_seconds"]
    status = solver.solve(m)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return _fail("INFEASIBLE", "절대 규칙을 모두 만족하는 근무표가 없습니다. 인원·휴가·필수 인원 설정을 확인하세요.")
    offset_of = {eid: next(k for k, y in enumerate(ys) if solver.value(y)) for eid, ys in offsets.items()}

    # 결과 조립
    emp_by_id = {e["id"]: e for e in emps}
    und_count = {eid: 0 for eid in emp_by_id}
    schedules, total, cost = [], 0, 0
    for d in days:
        for s, sd in shifts.items():
            assigned = []
            for e in emps:
                if not solver.value(x[e["id"], d, s]):
                    continue
                total += 1
                cost += sd["hours"] * e.get("hourly_wage", rules["default_hourly_wage"])
                reason = [f"{s} 최소 인원 충족"]
                if e.get("level") == "Senior" and reqs.get(s, {}).get("min_senior", 0):
                    reason.append("시니어 필수 요건 충족")
                if e.get("preferences", {}).get("preferred_shift") == s:
                    reason.append("선호 시프트 반영")
                if e.get("available_time_slots"):
                    reason.append("가용 시간대 일치")
                if "max_weekly_hours" in e:
                    reason.append(f"주 {e['max_weekly_hours']}시간 계약 조건 준수")
                if s in undesirable:
                    und_count[e["id"]] += 1
                    reason.append(f"기피 시프트 균등 분배 (누적 {und_count[e['id']]}회)")
                item = {
                    "employee_id": e["id"],
                    "name": e["name"],
                    "employment_type": e.get("employment_type"),
                    "assignment_reason": " + ".join(reason),
                }
                if e["id"] in offset_of:
                    item["rotation_offset"] = offset_of[e["id"]]
                assigned.append(item)
            if assigned:
                schedules.append({"date": d.isoformat(), "shift": s, "assigned_employees": assigned})

    warnings = [] if status == cp_model.OPTIMAL else ["시간 제한 내 최적해 미확정 — 실행 가능한 최선 해를 반환했습니다."]
    penalty = 0
    for name, sp in spreads:
        v = solver.value(sp)
        if v > 1:
            penalty += (v - 1) * 10
            warnings.append(f"{name} 근무 편차 {v}회 (목표 ±1회 초과)")
    result = {
        "status": "SUCCESS",
        "fairness_score": max(0, 100 - penalty),
        "summary": {"total_shifts_assigned": total, "legal_violations": 0, "estimated_labor_cost": cost},
        "schedules": schedules,
        "warnings_and_exceptions": warnings,
    }
    if rp is not None:  # 배정이 없는 직원도 다음 기간 전달이 가능하도록 직원별 위상을 항상 반환
        result["rotation_offsets"] = offset_of
    # 다음 기간 prior_consecutive_work_days로 그대로 넘길 값 (배정 없는 직원은 0)
    result["trailing_consecutive_work_days"] = {
        e["id"]: _trailing(days, {d for d in days if solver.value(work[e["id"], d])}, e.get("prior_consecutive_work_days", 0))
        for e in emps}
    # 다음 기간 prior_last_shift_end로 그대로 넘길 값
    result["last_shift_end"] = {
        e["id"]: _last_end(e, {d: s for d in days for s in shifts if solver.value(x[e["id"], d, s])}, shifts)
        for e in emps}
    # 다음 기간 prior_week_hours로 그대로 넘길 값
    result["trailing_week_hours"] = {
        e["id"]: _trailing_week(days, {d: s for d in days for s in shifts if solver.value(x[e["id"], d, s])},
                                shifts, e.get("prior_week_hours", 0))
        for e in emps}
    result["summary"]["legal_violations"] = len(validate(data, result))
    return result


def validate(data, result):
    """출력 근무표를 입력과 독립적으로 재검증해 절대 규칙 위반 목록을 반환."""
    rules = {**DEFAULT_RULES, **data.get("rules", {})}
    shifts = data["shift_definitions"]
    emps = {e["id"]: e for e in data["employees"]}
    by_emp = {}  # eid -> {date: shift}
    reported = {i: {k} for i, k in result.get("rotation_offsets", {}).items()}  # eid -> 출력에 기록된 위상 집합
    violations = []
    for row in result["schedules"]:
        d = date.fromisoformat(row["date"])
        ids = [a["employee_id"] for a in row["assigned_employees"]]
        r = data["shift_requirements"].get(row["shift"], {})
        if len(ids) < r.get("min_count", 0) or sum(emps[i].get("level") == "Senior" for i in ids) < r.get("min_senior", 0):
            violations.append(f"{d} {row['shift']} 필수 인원/시니어 미달")
        for a, i in zip(row["assigned_employees"], ids):
            if d in by_emp.setdefault(i, {}):
                violations.append(f"{i} {d} 중복 배정")
            by_emp[i][d] = row["shift"]
            if "rotation_offset" in a:
                reported.setdefault(i, set()).add(a["rotation_offset"])
            if row["date"] in emps[i].get("approved_leaves", []):
                violations.append(f"{i} {d} 휴가일 배정")
    first_wk = _week(date.fromisoformat(data["schedule_period"]["start_date"]))
    for i, ds in by_emp.items():
        cap = _cap(rules, emps[i])
        weekly = {first_wk: emps[i].get("prior_week_hours", 0)}
        for d, s in ds.items():
            weekly[_week(d)] = weekly.get(_week(d), 0) + shifts[s]["hours"]
            nxt = ds.get(d + timedelta(1))
            if nxt and 1440 + _window(shifts[nxt])[0] - _window(shifts[s])[1] < rules["min_rest_hours"] * 60:
                violations.append(f"{i} {d} 휴식 시간 부족")
            if all(d + timedelta(k) in ds for k in range(rules["max_consecutive_days"] + 1)):
                violations.append(f"{i} {d}부터 연속 근무 초과")
        violations += [f"{i} {wk} 주간 {h}h > {cap}h" for wk, h in weekly.items() if h > cap]
    # 빈 시프트(배정 0명)는 schedules에 없으므로 별도 확인
    present = {(r["date"], r["shift"]) for r in result["schedules"]}
    p = data["schedule_period"]
    start, end = date.fromisoformat(p["start_date"]), date.fromisoformat(p["end_date"])
    days = [start + timedelta(k) for k in range((end - start).days + 1)]
    for d in days:
        for s, r in data["shift_requirements"].items():
            if r.get("min_count", 0) and (d.isoformat(), s) not in present:
                violations.append(f"{d} {s} 배정 인원 없음")
    # 순환 패턴: 기록된 위상(없으면 가능한 모든 위상)으로 근무일 집합이 정확히 일치해야 함
    rp = rules.get("rotation_pattern")
    if rp is not None:
        for i, e in emps.items():
            if e.get("employment_type") != "Full_Time":
                continue
            fixed = e.get("rotation_offset")
            ks = reported.get(i) or ([fixed] if fixed is not None else range(rp["work_days"] + rp["off_days"]))
            leaves = set(e.get("approved_leaves", []))
            if len(reported.get(i, ())) > 1 or (fixed is not None and fixed not in ks) or not any(
                    set(by_emp.get(i, {})) == _rotation_workdays(days, rp, k, leaves) for k in ks):
                violations.append(f"{i} 순환 패턴 위반")
    # 기간 경계 연속 근무: 이전 기간 prior일 + 기간 첫 n+1-prior일 전부 근무면 상한 초과
    n = rules["max_consecutive_days"]
    for i, e in emps.items():
        prior = e.get("prior_consecutive_work_days", 0)
        if prior and n + 1 - prior <= len(days) and all(d in by_emp.get(i, {}) for d in days[:n + 1 - prior]):
            violations.append(f"{i} 기간 경계 연속 근무 초과 (이전 {prior}일 포함)")
    # 다음 기간 prior로 넘어가는 값이므로 전 직원 키와 값을 배정 결과로부터 다시 계산해 대조
    trailing = result.get("trailing_consecutive_work_days")
    if not isinstance(trailing, dict) or trailing.keys() != emps.keys():
        violations.append("trailing_consecutive_work_days 직원 키 불일치")
        trailing = trailing if isinstance(trailing, dict) else {}
    for i, e in emps.items():
        expected = _trailing(days, set(by_emp.get(i, {})), e.get("prior_consecutive_work_days", 0))
        if type(trailing.get(i)) is not int or trailing[i] != expected:
            violations.append(f"{i} trailing_consecutive_work_days {trailing.get(i)} != {expected}")
    # 기간 경계 휴식과 last_shift_end 재계산 대조
    last = result.get("last_shift_end")
    if not isinstance(last, dict) or last.keys() != emps.keys():
        violations.append("last_shift_end 직원 키 불일치")
        last = last if isinstance(last, dict) else {}
    for i, e in emps.items():
        prior_end, ds = _prior_end(e), by_emp.get(i, {})
        if prior_end:
            violations += [f"{i} {d} 기간 경계 휴식 시간 부족" for d, s in ds.items()
                           if _at(d, _window(shifts[s])[0]) - prior_end < timedelta(hours=rules["min_rest_hours"])]
        expected = _last_end(e, ds, shifts)
        if type(last.get(i)) is not type(expected) or last.get(i) != expected:
            violations.append(f"{i} last_shift_end {last.get(i)} != {expected}")
    # trailing_week_hours 재계산 대조
    tw = result.get("trailing_week_hours")
    if not isinstance(tw, dict) or tw.keys() != emps.keys():
        violations.append("trailing_week_hours 직원 키 불일치")
        tw = tw if isinstance(tw, dict) else {}
    for i, e in emps.items():
        expected = _trailing_week(days, by_emp.get(i, {}), shifts, e.get("prior_week_hours", 0))
        if type(tw.get(i)) is not int or tw[i] != expected:
            violations.append(f"{i} trailing_week_hours {tw.get(i)} != {expected}")
    return violations


if __name__ == "__main__":
    with open(sys.argv[1], encoding="utf-8") as f:
        print(json.dumps(solve(json.load(f)), ensure_ascii=False, indent=2))
