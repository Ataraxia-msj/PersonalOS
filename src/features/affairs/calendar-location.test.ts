import {it,expect} from "vitest";
import {parseCalendarLocation,shiftCalendarMonth} from "./calendar-location";
it("defaults malformed or duplicate params to server Shanghai today",()=>{
 for(const query of ["","view=week&month=bad","view=calendar&view=list&month=2026-99","month=0000-01"]) expect(parseCalendarLocation(new URLSearchParams(query),"2026-10-05")).toEqual({view:"list",month:"2026-10"});
 expect(parseCalendarLocation(new URLSearchParams("view=calendar&month=2027-01"),"2026-10-05")).toEqual({view:"calendar",month:"2027-01"});
});
it("navigates year boundaries but rejects dates outside supported range",()=>{
 expect(shiftCalendarMonth("2026-12",1)).toBe("2027-01");
 expect(shiftCalendarMonth("2026-01",-1)).toBe("2025-12");
 expect(()=>shiftCalendarMonth("1000-01",-1)).toThrow();
 expect(()=>shiftCalendarMonth("9999-12",1)).toThrow();
});
