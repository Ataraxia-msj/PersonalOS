import {expect,it} from 'vitest';
import {creationContext} from './context';
import type {AffairsProject} from '@/features/affairs/types';
it('only prefills a real accessible active project, never invents a focused assignment',()=>{const id='a0000000-0000-0000-0000-000000000001';expect(creationContext('task',undefined,[],[]).id).toBeNull();expect(creationContext('task',id,[{id,status:'archived'}] as AffairsProject[],[]).error).toBeTruthy();expect(creationContext('task',id,[{id,status:'active'}] as AffairsProject[],[]).id).toBe(id);});
