import {createFileRoute} from "@tanstack/react-router";
import {JSX, useState} from "react";
import {RangeSlider} from "../components/range-slider.tsx";
import {RadioGroup, RadioGroupItem} from "../@/components/ui/radio-group.tsx";
import {Label} from "../@/components/ui/label.tsx";
import {Slider} from "../@/components/ui/slider.tsx";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "../@/components/ui/card.tsx";
import {renderKvPair} from "../lib/key-value-card-helper.tsx";
import {prettyDuration} from "../lib/formatters.ts";
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
type OffsetOrigin = "start" | "end";
const allSlidingModes: SlidingMode[] = ["one", "two"];
const allOffsetOrigins: OffsetOrigin[] = ["start", "end"];

let predefinedRanges: LabelledRangeSelection[] = [
  {
    label: "first 6h",
    rangeSelection: {
      mode: "one",
      offsetOrigin: "start",
      hoursLimitIncluded: 6,
    },
  },
  {
    label: "first 12h",
    rangeSelection: {
      mode: "one",
      offsetOrigin: "start",
      hoursLimitIncluded: 12,
    },
  },
  {
    label: "first 24h",
    rangeSelection: {
      mode: "one",
      offsetOrigin: "start",
      hoursLimitIncluded: 24,
    },
  },
  {
    label: "first 7d",
    rangeSelection: {
      mode: "one",
      offsetOrigin: "start",
      hoursLimitIncluded: 7 * 24,
    },
  },
  {
    label: "last 6h",
    rangeSelection: {
      mode: "one",
      offsetOrigin: "end",
      hoursLimitIncluded: 6,
    },
  },
  {
    label: "last 12h",
    rangeSelection: {
      mode: "one",
      offsetOrigin: "end",
      hoursLimitIncluded: 12,
    },
  },
  {
    label: "last 24h",
    rangeSelection: {
      mode: "one",
      offsetOrigin: "end",
      hoursLimitIncluded: 24,
    },
  },
  {
    label: "last 7d",
    rangeSelection: {
      mode: "one",
      offsetOrigin: "end",
      hoursLimitIncluded: 7 * 24,
    },
  },
];

type LabelledRangeSelection = {
  label: string;
  rangeSelection: RangeSelection;
};

function calcDefaultValue(slidingMode: SlidingMode, offsetOrigin: OffsetOrigin) {
  switch (slidingMode) {
    case "one":
      switch (offsetOrigin) {
        case "start":
          return [24];
        case "end":
          return [24];
        default:
          return [-42];
      }

    case "two":
      switch (offsetOrigin) {
        case "start":
          return [24, 72];
        case "end":
          return [24, 72];
        default:
          return [-42, -42];
      }
  }
}

type RangeSelection =
  | {
  mode: "one";
  offsetOrigin: OffsetOrigin;
  hoursLimitIncluded: number;
}
  | {
  mode: "two";
  offsetOrigin: OffsetOrigin;
  hoursLte: number;
  hoursGte: number;
};

type RangeSelectionLabel = { from: string; to: string };

function calcRangeSelectionLabels(rangeSelection: RangeSelection): RangeSelectionLabel {
  switch (rangeSelection.mode) {
    case "one":
      return rangeSelection.offsetOrigin === "start"
        ? {from: "Start", to: `${hourToPrettyString(rangeSelection.hoursLimitIncluded)} from start`}
        : {from: `${hourToPrettyString(rangeSelection.hoursLimitIncluded)} from end`, to: "End"};
    case "two":
      return rangeSelection.offsetOrigin === "start"
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

function calcRangeSelection(slidingMode: SlidingMode, offsetOrigin: OffsetOrigin, slidingValuesMinutes: number[]) {
  let rangeSelection: RangeSelection;
  switch (slidingMode) {
    case "one":
      rangeSelection = {mode: "one", offsetOrigin, hoursLimitIncluded: slidingValuesMinutes.at(0) ?? 0};
      break;
    case "two":
      rangeSelection = {
        mode: "two",
        offsetOrigin,
        hoursGte: slidingValuesMinutes.at(0) ?? 0,
        hoursLte: slidingValuesMinutes.at(1) ?? 24,
      };

      break;
  }
  return rangeSelection;
}

function SliderPlaygroundComponent() {
  let [slidingMode, setSlidingMode] = useState<SlidingMode>("one");
  let [offsetOrigin, setOffsetOrigin] = useState<OffsetOrigin>("end");
  let maxValueHours = 3 * 7 * 24;
  let stepValueHours = 6;

  let [sliderValuesHours, setSliderValuesHours] = useState(calcDefaultValue(slidingMode, offsetOrigin));
  let [slidingValuesHours, setSlidingValuesHours] = useState(calcDefaultValue(slidingMode, offsetOrigin));

  function handleSlidingModeChange(newValue: string) {
    let newSlidingMode = newValue as SlidingMode;

    setSlidingMode(newSlidingMode);
    setSlidingValuesHours(calcDefaultValue(newSlidingMode, offsetOrigin));
    setSliderValuesHours(calcDefaultValue(newSlidingMode, offsetOrigin));
  }

  function setRangeSelection(rangeSelection: RangeSelection) {
    setOffsetOrigin(rangeSelection.offsetOrigin);
    setSlidingMode(rangeSelection.mode);
    switch (rangeSelection.mode) {
      case "one":
        setOffsetOrigin(rangeSelection.offsetOrigin);
        setSliderValuesHours([rangeSelection.hoursLimitIncluded]);
        setSlidingValuesHours([rangeSelection.hoursLimitIncluded]);
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
        <DropdownMenuTrigger>Predefined Range</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Predefined Range</DropdownMenuLabel>
          <DropdownMenuSeparator/>
          {predefinedRanges.map(({label, rangeSelection}) => {
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
    let newOffsetOrigin = newValue as OffsetOrigin;

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
          <CardContent className="flex flex-col gap-4">
            {createPreSelectionDropdownMenu()}

            <div className="flex flex-row gap-2">
              <RadioGroup defaultValue={slidingMode} onValueChange={handleSlidingModeChange}>
                {allSlidingModes.map((mode) => {
                  return (
                    <div key={mode} className="flex items-center space-x-2">
                      <RadioGroupItem value={mode} id={mode}/>
                      <Label htmlFor={mode}>{mode}</Label>
                    </div>
                  );
                })}
              </RadioGroup>

              <RadioGroup defaultValue={offsetOrigin} onValueChange={handleOffsetOriginChange}>
                {allOffsetOrigins.map((mode) => {
                  return (
                    <div key={mode} className="flex items-center space-x-2">
                      <RadioGroupItem value={mode} id={mode}/>
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
                inverted={offsetOrigin === "end"}
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
