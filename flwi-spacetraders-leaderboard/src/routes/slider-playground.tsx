import {createFileRoute} from "@tanstack/react-router";
import React, {JSX, useMemo, useState} from "react";
import {RangeSlider} from "../components/range-slider.tsx";
import {RadioGroup, RadioGroupItem} from "../@/components/ui/radio-group.tsx";
import {Label} from "../@/components/ui/label.tsx";
import {Slider} from "../@/components/ui/slider.tsx";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "../@/components/ui/card.tsx";
import {renderKvPair} from "../lib/key-value-card-helper.tsx";
import {prettyDuration} from "../lib/formatters.ts";

export const Route = createFileRoute("/slider-playground")({
  component: SliderPlaygroundComponent,
});

type SlidingMode = "fromBeginning" | "fromEnd" | "precise";
const allSlidingModes: SlidingMode[] = ["fromBeginning", "fromEnd", "precise"];

function calcDefaultValue(slidingMode: SlidingMode) {
  switch (slidingMode) {
    case "fromBeginning":
      return [24];
    case "fromEnd":
      return [24];
    case "precise":
      return [24, 72];
  }
}

type ModeFoo = {
  mode: SlidingMode;
};

type RangeSelection =
  | {
  mode: "fromBeginning";
  minutesLte: number;
}
  | {
  mode: "fromEnd";
  minutesGte: number;
}
  | {
  mode: "precise";
  minutesLte: number;
  minutesGte: number;
};

type RangeSelectionLabel = { from: string; to: string };

function calcRangeSelectionLabels(rangeSelection: RangeSelection): RangeSelectionLabel {
  switch (rangeSelection.mode) {
    case "fromBeginning":
      return {from: "Start", to: `${hourToPrettyString(rangeSelection.minutesLte)} from start`};
    case "fromEnd":
      return {from: `End - ${hourToPrettyString(rangeSelection.minutesGte)}`, to: "End"};

    case "precise":
      return {
        from: `${hourToPrettyString(rangeSelection.minutesGte)} from start`,
        to: `${hourToPrettyString(rangeSelection.minutesLte)} from start`,
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

function calcRangeSelection(slidingMode: "fromBeginning" | "fromEnd" | "precise", slidingValuesMinutes: number[]) {
  let rangeSelection: RangeSelection;
  switch (slidingMode) {
    case "fromBeginning":
      rangeSelection = {mode: "fromBeginning", minutesLte: slidingValuesMinutes.at(0) ?? 0};
      break;
    case "fromEnd":
      rangeSelection = {mode: "fromEnd", minutesGte: slidingValuesMinutes.at(0) ?? 0};
      break;
    case "precise":
      rangeSelection = {
        mode: "precise",
        minutesGte: slidingValuesMinutes.at(0) ?? 0,
        minutesLte: slidingValuesMinutes.at(1) ?? 0,
      };
      break;
  }
  return rangeSelection;
}

function SliderPlaygroundComponent() {
  let [slidingMode, setSlidingMode] = useState<SlidingMode>("fromBeginning");
  let maxValue = 3 * 7 * 24;

  let [sliderValuesMinutes, setSliderValuesMinutes] = useState(calcDefaultValue(slidingMode));
  let [slidingValuesMinutes, setSlidingValuesMinutes] = useState(calcDefaultValue(slidingMode));

  function handleSlidingModeChange(newValue: string) {
    let oldSlidingMode = slidingMode;
    let newSlidingMode = newValue as SlidingMode;
    setSlidingMode(newSlidingMode);
    if (oldSlidingMode === "precise" || newSlidingMode === "precise") {
      setSliderValuesMinutes(calcDefaultValue(newSlidingMode));
      setSlidingValuesMinutes(calcDefaultValue(newSlidingMode));
    }
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
            {slidingMode == "precise" ? (
              <RangeSlider
                defaultValue={sliderValuesMinutes}
                max={maxValue}
                step={6}
                onValueCommit={setSliderValuesMinutes}
                onValueChange={setSlidingValuesMinutes}
              />
            ) : (
              <Slider
                defaultValue={sliderValuesMinutes}
                inverted={slidingMode === "fromEnd"}
                min={6}
                max={maxValue}
                step={6}
                onValueCommit={setSliderValuesMinutes}
                onValueChange={setSlidingValuesMinutes}
              />
            )}
          </CardContent>
        </Card>
        <Card className="w-[550px]">
          <CardHeader>
            <CardTitle>Current Selection</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {prettyPrintRangeSelection(calcRangeSelectionLabels(calcRangeSelection(slidingMode, slidingValuesMinutes)))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
