import {atom, createStore} from 'jotai'
import {GetLeaderboardForResetResponseContent} from "../../generated";

export const store = createStore();


export const resetDatesAtom = atom([] as string[])


export interface ResetData {
  resetDate: string,
  loadedAgents: string[]
}
export const resetDataAtom = atom(new Map<string, GetLeaderboardForResetResponseContent>)

