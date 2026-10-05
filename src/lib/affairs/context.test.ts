import {expect,it} from 'vitest';
import {creationContext,creationDate} from './context';
import type {AffairsProject} from '@/features/affairs/types';
it('only prefills a real accessible active project, never invents a focused assignment',()=>{const id='a0000000-0000-0000-0000-000000000001';expect(creationContext('task',undefined,[],[]).id).toBeNull();expect(creationContext('task',id,[{id,status:'archived'}] as AffairsProject[],[]).error).toBeTruthy();expect(creationContext('task',id,[{id,status:'active'}] as AffairsProject[],[]).id).toBe(id);});
it('prefills only a valid calendar date and never saves it',()=>{
 expect(creationDate(undefined)).toEqual({date:null,error:null});
 expect(creationDate('2026-10-08')).toEqual({date:'2026-10-08',error:null});
 for(const value of ['2026-02-30','10-08','0999-12-31','10000-01-01'])expect(creationDate(value)).toMatchObject({date:null,error:expect.any(String)});
});
