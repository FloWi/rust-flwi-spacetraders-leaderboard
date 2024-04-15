import {atom, createStore} from 'jotai'

export const store = createStore();


export const resetDatesAtom = atom([] as string[])


interface ResetData {

}
export const resetDataAtom = atom(new Map<string, ResetData>)
