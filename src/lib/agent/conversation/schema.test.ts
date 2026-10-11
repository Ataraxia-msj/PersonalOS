// @vitest-environment node
import {it,expect} from 'vitest';
import {parseModelFinanceTurn} from '../schema';
import {modelTurn,meal,id} from './test-fixtures';
it('accepts only bounded strict updates and additions',()=>{
 expect(parseModelFinanceTurn(modelTurn({additions:[meal]})).additions).toHaveLength(1);
 for(const value of [modelTurn({additions:Array(21).fill(meal)}),{...modelTurn(),saved:true},modelTurn({updates:[{draftId:id(10),changes:[{field:'amount',value:0,origin:'explicit'}]}]}),modelTurn({kind:'route',routeDomain:'affairs',additions:[meal]}),modelTurn({kind:'clarify',updates:[{draftId:id(10),changes:[]}]}),{...modelTurn(),requestId:id(2)}])expect(()=>parseModelFinanceTurn(value)).toThrow();
});
