import json

from solver import solve, validate

data = json.load(open("sample_input.json", encoding="utf-8"))
out = solve(data)
assert out["status"] == "SUCCESS", out["warnings_and_exceptions"]
assert out["summary"]["legal_violations"] == 0, validate(data, out)
assert not any(a["employee_id"] == "E01" for r in out["schedules"] if r["date"] == "2026-11-10" for a in r["assigned_employees"])

# 검증기 자체가 위반을 잡는지: 휴가일(E01, 11/10)에 강제 배정
out["schedules"].append({"date": "2026-11-10", "shift": "Peak_PartTime", "assigned_employees": [{"employee_id": "E01"}]})
assert validate(data, out), "validator missed a leave violation"
print("ok", out["fairness_score"], out["summary"])

# 순환 패턴 2-1: 풀타임은 근무일 1시프트·휴무일 0, 검증기가 패턴 이탈을 잡는지
rot = {**data, "rules": {**data["rules"], "rotation_pattern": {"work_days": 2, "off_days": 1}}}
out = solve(rot)
assert out["status"] == "SUCCESS", out["warnings_and_exceptions"]
assert out["summary"]["legal_violations"] == 0, validate(rot, out)
row = next(r for r in out["schedules"] if r["date"] == "2026-11-02" and r["shift"] == "Opening")
row["assigned_employees"] = [a for a in row["assigned_employees"] if a["employee_id"] != row["assigned_employees"][0]["employee_id"]]
assert any("순환 패턴" in v for v in validate(rot, out)), "validator missed a rotation violation"
bad = {**data, "rules": {**data["rules"], "rotation_pattern": {"work_days": 6, "off_days": 1}}}
assert solve(bad)["status"] == "INVALID_INPUT"
for rp in ("2-1", {"work_days": True, "off_days": 1}):
    assert solve({**data, "rules": {**data["rules"], "rotation_pattern": rp}})["status"] == "INVALID_INPUT", rp
# 입력 rotation_offset 고정: 그대로 반영, 범위 밖이면 INVALID_INPUT
fixed = {**rot, "employees": [{**e, "rotation_offset": 1} if e["id"] == "E02" else e for e in rot["employees"]]}
out2 = solve(fixed)
assert out2["status"] == "SUCCESS" and out2["summary"]["legal_violations"] == 0, out2["warnings_and_exceptions"]
assert {a["rotation_offset"] for r in out2["schedules"] for a in r["assigned_employees"] if a["employee_id"] == "E02"} == {1}
for k in (3, True, 1.0):
    fixed["employees"][1]["rotation_offset"] = k
    assert solve(fixed)["status"] == "INVALID_INPUT", k
# 배정 0건(전 기간 휴가)인 풀타임도 rotation_offsets로 위상을 반환
idle = {"schedule_period": {"start_date": "2026-11-01", "end_date": "2026-11-03"}, "rules": {"rotation_pattern": {"work_days": 2, "off_days": 1}},
        "shift_definitions": {"D": {"start": "08:00", "end": "16:00", "hours": 8}}, "shift_requirements": {},
        "employees": [{"id": "A", "name": "a", "employment_type": "Full_Time", "approved_leaves": ["2026-11-01", "2026-11-02", "2026-11-03"]}]}
out3 = solve(idle)
assert out3["status"] == "SUCCESS" and out3["schedules"] == [] and out3["rotation_offsets"].keys() == {"A"}, out3
idle["employees"][0]["employment_type"] = "Part_Time"  # 풀타임 0명이어도 빈 맵 반환
assert solve(idle)["rotation_offsets"] == {}
# 기간 경계 연속 근무: prior 4일(상한 5)이면 첫 2일 중 하루는 휴무, trailing은 prior 포함
one = {"schedule_period": {"start_date": "2026-11-01", "end_date": "2026-11-03"}, "rules": {"max_consecutive_days": 5},
       "shift_definitions": {"D": {"start": "08:00", "end": "16:00", "hours": 8}}, "shift_requirements": {"D": {"min_count": 1}},
       "employees": [{"id": "A", "name": "a", "prior_consecutive_work_days": 4}, {"id": "B", "name": "b"}]}
out4 = solve(one)
a_days = {r["date"] for r in out4["schedules"] for x in r["assigned_employees"] if x["employee_id"] == "A"}
assert out4["status"] == "SUCCESS" and {"2026-11-01", "2026-11-02"} - a_days, out4
assert out4["summary"]["legal_violations"] == 0 and set(out4["trailing_consecutive_work_days"]) == {"A", "B"}
one["employees"] = one["employees"][:1]  # A 혼자면 첫 2일 연속 근무 불가피 → INFEASIBLE
assert solve(one)["status"] == "INFEASIBLE"
one["schedule_period"]["end_date"] = "2026-11-01"
one["employees"][0]["prior_consecutive_work_days"] = 3  # 1일 기간 전부 근무 → trailing = 3 + 1
assert solve(one)["trailing_consecutive_work_days"] == {"A": 4}
assert validate({**one, "employees": [{**one["employees"][0], "prior_consecutive_work_days": 5}]},
                solve(one)), "validator missed a boundary consecutive violation"
out5 = solve(one)
out5["trailing_consecutive_work_days"]["A"] = 0  # 다음 기간으로 넘길 값 변조
assert validate(one, out5), "validator missed a tampered trailing value"
for bad_map in ({"A": True}, {"A": 1, "GHOST": 0}):  # bool 값, 미등록 키
    one_day = {**one, "employees": [{**one["employees"][0], "prior_consecutive_work_days": 0}]}
    o = solve(one_day)
    assert o["trailing_consecutive_work_days"] == {"A": 1} and not validate(one_day, o)
    o["trailing_consecutive_work_days"] = bad_map
    assert validate(one_day, o), bad_map
for k in (6, -1, True, 2.0):
    one["employees"][0]["prior_consecutive_work_days"] = k
    assert solve(one)["status"] == "INVALID_INPUT", k
# 기간 경계 휴식: 전날 Closing 24:00 종료 → 첫날 Opening 08:00(8h < 11h) 금지, Middle 12:00(12h)은 허용
rest = {"schedule_period": {"start_date": "2026-11-01", "end_date": "2026-11-02"}, "rules": {},
        "shift_definitions": {k: data["shift_definitions"][k] for k in ("Opening", "Middle")},
        "shift_requirements": {"Opening": {"min_count": 1}},
        "employees": [{"id": "A", "name": "a", "prior_last_shift_end": "2026-11-01T00:00"}, {"id": "B", "name": "b"}]}
out6 = solve(rest)
first = next(r for r in out6["schedules"] if r["date"] == "2026-11-01" and r["shift"] == "Opening")
assert out6["status"] == "SUCCESS" and [a["employee_id"] for a in first["assigned_employees"]] == ["B"], out6
assert out6["summary"]["legal_violations"] == 0
first["assigned_employees"] = [{"employee_id": "A"}]  # 경계 휴식 위반 강제
assert any("경계 휴식" in v for v in validate(rest, out6)), "validator missed a boundary rest violation"
out7 = solve(rest)
out7["last_shift_end"]["B"] = "2026-11-01T00:00"  # 다음 기간으로 넘길 값 변조
assert validate(rest, out7), "validator missed a tampered last_shift_end"
rest["employees"] = rest["employees"][:1] + [{"id": "B", "name": "b", "approved_leaves": ["2026-11-01", "2026-11-02"]}]
out8 = solve(rest)  # A 혼자: 11/1 Opening 불가 → INFEASIBLE, 휴가 중 B는 입력 prior(없음) → null
assert out8["status"] == "INFEASIBLE", out8
rest["shift_requirements"] = {}
out8 = solve(rest)
assert out8["last_shift_end"] == {"A": "2026-11-01T00:00", "B": None}  # 무배정: 입력 prior 그대로 / 없으면 null
for v in ("2026-11-01 25:00", True, 20261101, "2026-11-01T00:00+09:00", "2026-10-31", "20261031", "2026-W44-6",
          "2026-10-31X23:00", "2026-10-31 23:00", "2026-10-31T23:00:00", "2026-13-01T00:00"):
    rest["employees"][0]["prior_last_shift_end"] = v
    assert solve(rest)["status"] == "INVALID_INPUT", v
# 경계 주 근로시간: 11/01(일)은 ISO 주 10/26~11/01. prior 48h + 8h > 상한 52h → A는 11/01 배정 불가
week = {"schedule_period": {"start_date": "2026-11-01", "end_date": "2026-11-03"}, "rules": {},
        "shift_definitions": {"D": {"start": "08:00", "end": "16:00", "hours": 8}}, "shift_requirements": {"D": {"min_count": 1}},
        "employees": [{"id": "A", "name": "a", "prior_week_hours": 48}, {"id": "B", "name": "b"}]}
out9 = solve(week)
d1 = next(r for r in out9["schedules"] if r["date"] == "2026-11-01")
assert out9["status"] == "SUCCESS" and [a["employee_id"] for a in d1["assigned_employees"]] == ["B"], out9
assert out9["summary"]["legal_violations"] == 0 and set(out9["trailing_week_hours"]) == {"A", "B"}
d1["assigned_employees"] = [{"employee_id": "A"}]  # prior 48 + 8 > 52 강제
assert any("주간" in v for v in validate(week, out9)), "validator missed a boundary week-hours violation"
out10 = solve(week)
out10["trailing_week_hours"]["A"] += 1  # 다음 기간으로 넘길 값 변조
assert validate(week, out10), "validator missed a tampered trailing_week_hours"
week["schedule_period"] = {"start_date": "2026-11-02", "end_date": "2026-11-02"}  # 월요일 1일: 같은 주로 이어짐, 무배정 A는 prior 그대로
week["employees"][0]["prior_week_hours"] = 50
out11 = solve(week)
assert out11["trailing_week_hours"] == {"A": 50, "B": 8}, out11["trailing_week_hours"]
# 일요일 종료 → 월요일 시작: carry는 0이어서 새 주 배정이 막히지 않음 (상한 8h)
sun = {**week, "rules": {"max_weekly_hours": 8}, "schedule_period": {"start_date": "2026-11-01", "end_date": "2026-11-01"},
       "employees": [{"id": "A", "name": "a"}]}
out12 = solve(sun)
assert out12["status"] == "SUCCESS" and out12["trailing_week_hours"] == {"A": 0}, out12
mon = {**sun, "schedule_period": {"start_date": "2026-11-02", "end_date": "2026-11-02"},
       "employees": [{"id": "A", "name": "a", "prior_week_hours": out12["trailing_week_hours"]["A"]}]}
assert solve(mon)["status"] == "SUCCESS"
for h in (53, -1, True, 8.0, "8"):
    week["employees"][0]["prior_week_hours"] = h
    assert solve(week)["status"] == "INVALID_INPUT", h
print("ok rotation", out["fairness_score"], out["summary"])
