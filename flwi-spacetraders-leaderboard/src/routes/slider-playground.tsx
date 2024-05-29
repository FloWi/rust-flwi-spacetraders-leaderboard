import { createFileRoute } from "@tanstack/react-router";
import { JSX, useState } from "react";
import { RangeSlider } from "../components/range-slider.tsx";
import { RadioGroup, RadioGroupItem } from "../@/components/ui/radio-group.tsx";
import { Label } from "../@/components/ui/label.tsx";
import { Slider } from "../@/components/ui/slider.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../@/components/ui/card.tsx";
import { renderKvPair } from "../lib/key-value-card-helper.tsx";
import { prettyDuration } from "../lib/formatters.ts";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../@/components/ui/dropdown-menu.tsx";

export const Route = createFileRoute("/slider-playground")({
  component: SliderPlaygroundComponent,
});

type SlidingMode = "one" | "two";
const allSlidingModes: SlidingMode[] = ["one", "two"];
const allOffsetOrigins: SelectionMode[] = ["first", "last"];

export type SelectionMode = "first" | "last";

type RangeSelection =
  | {
      mode: "one";
      selectionMode: SelectionMode;
      hoursLte: number;
    }
  | {
      mode: "two";
      selectionMode: SelectionMode;
      hoursLte: number;
      hoursGte: number;
    };

type LabelledRangeSelection = {
  label: string;
  rangeSelection: RangeSelection;
};

const defaultRangeSelection: LabelledRangeSelection = {
  label: "last 6h",
  rangeSelection: {
    mode: "one",
    selectionMode: "last",
    hoursLte: 6,
  },
};
const predefinedRanges: LabelledRangeSelection[] = [
  {
    label: "first 6h",
    rangeSelection: {
      mode: "one",
      selectionMode: "first",
      hoursLte: 6,
    },
  },
  {
    label: "first 12h",
    rangeSelection: {
      mode: "one",
      selectionMode: "first",
      hoursLte: 12,
    },
  },
  {
    label: "first 24h",
    rangeSelection: {
      mode: "one",
      selectionMode: "first",
      hoursLte: 24,
    },
  },
  {
    label: "first 7d",
    rangeSelection: {
      mode: "one",
      selectionMode: "first",
      hoursLte: 7 * 24,
    },
  },
  defaultRangeSelection,
  {
    label: "last 12h",
    rangeSelection: {
      mode: "one",
      selectionMode: "last",
      hoursLte: 12,
    },
  },
  {
    label: "last 24h",
    rangeSelection: {
      mode: "one",
      selectionMode: "last",
      hoursLte: 24,
    },
  },
  {
    label: "last 7d",
    rangeSelection: {
      mode: "one",
      selectionMode: "last",
      hoursLte: 7 * 24,
    },
  },
];

function calcDefaultValue(slidingMode: SlidingMode, offsetOrigin: SelectionMode) {
  switch (slidingMode) {
    case "one":
      switch (offsetOrigin) {
        case "first":
          return [24];
        case "last":
          return [24];
        default:
          return [-42];
      }

    case "two":
      switch (offsetOrigin) {
        case "first":
          return [24, 72];
        case "last":
          return [24, 72];
        default:
          return [-42, -42];
      }
  }
}

type RangeSelectionLabel = { from: string; to: string };

function calcRangeSelectionLabels(rangeSelection: RangeSelection): RangeSelectionLabel {
  switch (rangeSelection.mode) {
    case "one":
      return rangeSelection.selectionMode === "first"
        ? { from: "Start", to: `${hourToPrettyString(rangeSelection.hoursLte)} from start` }
        : { from: `${hourToPrettyString(rangeSelection.hoursLte)} from end`, to: "End" };
    case "two":
      return rangeSelection.selectionMode === "first"
        ? {
            from: `${hourToPrettyString(rangeSelection.hoursGte)} from start`,
            to: `${hourToPrettyString(rangeSelection.hoursLte)} from start`,
          }
        : {
            from: `${hourToPrettyString(rangeSelection.hoursGte)} from end`,
            to: `${hourToPrettyString(rangeSelection.hoursLte)} from end`,
          };
  }
}

function prettyPrintRangeSelection(label: RangeSelectionLabel): JSX.Element {
  return (
    <div className="grid grid-cols-2 w-full gap-6">
      {renderKvPair("From", label.from)}
      {renderKvPair("To", label.to)}
    </div>
  );
}

function hourToPrettyString(hourValue: number): string {
  return prettyDuration(hourValue * 60 * 60 * 1000);
}

function calcRangeSelection(slidingMode: SlidingMode, selectionMode: SelectionMode, slidingValuesMinutes: number[]) {
  let rangeSelection: RangeSelection;
  switch (slidingMode) {
    case "one":
      rangeSelection = { mode: "one", selectionMode, hoursLte: slidingValuesMinutes.at(0) ?? 0 };
      break;
    case "two":
      rangeSelection = {
        mode: "two",
        selectionMode,
        hoursGte: slidingValuesMinutes.at(0) ?? 0,
        hoursLte: slidingValuesMinutes.at(1) ?? 24,
      };

      break;
  }
  return rangeSelection;
}

function SliderPlaygroundComponent() {
  const [slidingMode, setSlidingMode] = useState<SlidingMode>("one");
  const [offsetOrigin, setOffsetOrigin] = useState<SelectionMode>("last");
  const maxValueHours = 3 * 7 * 24;
  const stepValueHours = 6;

  const [sliderValuesHours, setSliderValuesHours] = useState(calcDefaultValue(slidingMode, offsetOrigin));
  const [slidingValuesHours, setSlidingValuesHours] = useState(calcDefaultValue(slidingMode, offsetOrigin));

  function handleSlidingModeChange(newValue: string) {
    const newSlidingMode = newValue as SlidingMode;

    setSlidingMode(newSlidingMode);
    setSlidingValuesHours(calcDefaultValue(newSlidingMode, offsetOrigin));
    setSliderValuesHours(calcDefaultValue(newSlidingMode, offsetOrigin));
  }

  function setRangeSelection(rangeSelection: RangeSelection) {
    setOffsetOrigin(rangeSelection.selectionMode);
    setSlidingMode(rangeSelection.mode);
    switch (rangeSelection.mode) {
      case "one":
        setOffsetOrigin(rangeSelection.selectionMode);
        setSliderValuesHours([rangeSelection.hoursLte]);
        setSlidingValuesHours([rangeSelection.hoursLte]);
        break;
      case "two":
        setSliderValuesHours([rangeSelection.hoursGte, rangeSelection.hoursLte]);
        setSlidingValuesHours([rangeSelection.hoursGte, rangeSelection.hoursLte]);
        break;
    }
  }

  function createPreSelectionDropdownMenu() {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger>Select Range</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Predefined Ranges</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {predefinedRanges.map(({ label, rangeSelection }) => {
            return (
              <DropdownMenuItem
                key={label}
                onClick={() => {
                  setRangeSelection(rangeSelection);
                }}
              >
                {label}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  function handleOffsetOriginChange(newValue: string) {
    const newOffsetOrigin = newValue as SelectionMode;

    setOffsetOrigin(newOffsetOrigin);
    //setSliderValuesHours(calcDefaultValue(slidingMode, newOffsetOrigin));
    //setSlidingValuesHours(calcDefaultValue(slidingMode, newOffsetOrigin));
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        <Card className="w-[550px]">
          <CardHeader>
            <CardTitle>Range Selection</CardTitle>
            <CardDescription>Select the range you want to view</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 items-start">
            {createPreSelectionDropdownMenu()}

            <div className="flex flex-row gap-2">
              <RadioGroup defaultValue={slidingMode} onValueChange={handleSlidingModeChange}>
                {allSlidingModes.map((mode) => {
                  return (
                    <div key={mode} className="flex items-center space-x-2">
                      <RadioGroupItem value={mode} id={mode} />
                      <Label htmlFor={mode}>{mode}</Label>
                    </div>
                  );
                })}
              </RadioGroup>

              <RadioGroup defaultValue={offsetOrigin} onValueChange={handleOffsetOriginChange}>
                {allOffsetOrigins.map((mode) => {
                  return (
                    <div key={mode} className="flex items-center space-x-2">
                      <RadioGroupItem value={mode} id={mode} />
                      <Label htmlFor={mode}>{mode}</Label>
                    </div>
                  );
                })}
              </RadioGroup>
            </div>
            {slidingMode === "two" ? (
              <RangeSlider
                value={slidingValuesHours}
                max={maxValueHours}
                step={stepValueHours}
                onValueCommit={setSliderValuesHours}
                onValueChange={setSlidingValuesHours}
              />
            ) : (
              <Slider
                value={slidingValuesHours}
                inverted={offsetOrigin === "last"}
                min={6}
                max={maxValueHours}
                step={stepValueHours}
                onValueCommit={setSliderValuesHours}
                onValueChange={setSlidingValuesHours}
              />
            )}
          </CardContent>
        </Card>
        <Card className="w-[550px]">
          <CardHeader>
            <CardTitle>Current Selection</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {prettyPrintRangeSelection(
              calcRangeSelectionLabels(calcRangeSelection(slidingMode, offsetOrigin, slidingValuesHours)),
            )}
          </CardContent>
        </Card>
        <Card className="w-[550px]">
          <CardHeader>
            <CardTitle>Committed Selection</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {prettyPrintRangeSelection(
              calcRangeSelectionLabels(calcRangeSelection(slidingMode, offsetOrigin, sliderValuesHours)),
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
