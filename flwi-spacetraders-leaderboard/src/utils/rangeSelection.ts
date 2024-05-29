export type SelectionMode = "first" | "last";

export const AllSelectionModes: SelectionMode[] = ["first", "last"];

export type RangeSelection = {
  selectionMode: SelectionMode;
  hoursLte: number;
  hoursGte?: number;
};

export const defaultRangeSelection: RangeSelection = {
  selectionMode: "last",
  hoursLte: 6,
};
export const predefinedRanges: RangeSelection[] = [
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
