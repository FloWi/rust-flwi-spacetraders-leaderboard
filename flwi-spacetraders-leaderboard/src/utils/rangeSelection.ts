export type SelectionMode = "first" | "last";

export type RangeSelection = {
  selectionMode: SelectionMode;
  hoursLte: number;
  hoursGte?: number;
};

export let defaultRangeSelection: RangeSelection = {
  selectionMode: "last",
  hoursLte: 6,
};
export let predefinedRanges: RangeSelection[] = [
  {
    selectionMode: "first",
    hoursLte: 6,
  },

  {
    selectionMode: "first",
    hoursLte: 12,
  },

  {
    selectionMode: "first",
    hoursLte: 24,
  },

  {
    selectionMode: "first",
    hoursLte: 7 * 24,
  },

  defaultRangeSelection,
  {
    selectionMode: "last",
    hoursLte: 12,
  },

  {
    selectionMode: "last",
    hoursLte: 24,
  },

  {
    selectionMode: "last",
    hoursLte: 7 * 24,
  },
];
