import {describe,it,expect} from 'vitest';
import {adaptBalance,adaptReceipt,adaptProject} from './adapters';
import type {ProjectProgressRow} from './types';
describe('affairs adapters',()=>{
 it('maps legitimate absent wallet to zero',()=>expect(adaptBalance(null)).toBe(0));
 it('refuses imprecise balance/revision instead of rounding',()=>{
 expect(()=>adaptBalance({user_id:'u',balance_coins:9007199254740993,last_sequence:1})).toThrow();
 expect(()=>adaptReceipt({object_id:'x',object_revision:9007199254740993,command_id:'c',coin_delta:1,balance_coins:1,replayed:false})).toThrow();
 });
 it('retains database fraction and decimal revision',()=>{expect(adaptProject({revision:'9007199254740993',milestone_total:5,milestone_completed:2,progress_rate:0.4} as ProjectProgressRow)).toMatchObject({revision:'9007199254740993',progressRate:0.4,milestoneTotal:5});});
});
