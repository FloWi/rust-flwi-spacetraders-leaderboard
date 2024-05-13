import {Duration} from "luxon";

export const prettyDuration = (durationMs: number) => {
  let d = Duration.fromMillis(durationMs);
  return d.toFormat("d'd' hh:mm");
};
export let intNumberFmt = new Intl.NumberFormat();

export let percentNumberFmt = new Intl.NumberFormat(undefined, {
  style: "percent",
  minimumFractionDigits: 1,
});
let dateTimeFormatOptions: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
  hour12: false,
};
export let dateFmt = new Intl.DateTimeFormat(undefined, dateTimeFormatOptions);

export let compactNumberFmt = new Intl.NumberFormat(undefined, {
  notation: "compact",
  compactDisplay: "short",
  //minimumSignificantDigits: 2
});
