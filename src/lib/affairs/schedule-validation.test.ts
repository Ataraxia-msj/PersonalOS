import {describe,it,expect} from "vitest";
import {normalizeScheduleTime,validateScheduleMetadata} from "./schedule-validation";
describe("schedule boundary",()=>{
 it("normalizes PostgreSQL minute precision without hiding missing fields",()=>{
  expect(normalizeScheduleTime("10:30:00")).toBe("10:30");
  expect(normalizeScheduleTime(null)).toBeNull();
  for(const value of [undefined,"24:00","10:30:01","bad",1]) expect(()=>normalizeScheduleTime(value)).toThrow();
 });
 it("validates real dates and time dependencies, not device timezone",()=>{
  for(const time of ["00:00","23:59"]) expect(validateScheduleMetadata({due_date:"2026-10-08",planned_time:time,planned_start_date:"2026-10-01"})).toEqual({});
  expect(validateScheduleMetadata({due_date:null,planned_time:"10:30"})).toHaveProperty("planned_time");
  expect(validateScheduleMetadata({due_date:"2026-10-08",planned_start_date:"2026-10-09"})).toHaveProperty("planned_start_date");
  expect(validateScheduleMetadata({due_date:null,planned_start_date:"2026-02-30"})).toHaveProperty("planned_start_date");
  for(const time of ["24:00","10:30:00"]) expect(validateScheduleMetadata({due_date:"2026-10-08",planned_time:time})).toHaveProperty("planned_time");
  expect(validateScheduleMetadata({due_date:null,planned_start_date:"2026-10-08"})).toEqual({});
 });
});
