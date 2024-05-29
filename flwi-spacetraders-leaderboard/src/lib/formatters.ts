import {Duration} from "luxon";

export const prettyDuration = (durationMs: number) => {
  const d = Duration.fromMillis(durationMs);
  return d.toFormat("d'd' hh:mm");
};
export const intNumberFmt = new Intl.NumberFormat();

export const percentNumberFmt = new Intl.NumberFormat(undefined, {
  style: "percent",
  minimumFractionDigits: 1,
});
const dateTimeFormatOptions: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
  hour12: false,
};
export const dateFmt = new Intl.DateTimeFormat(undefined, dateTimeFormatOptions);

export const compactNumberFmt = new Intl.NumberFormat(undefined, {
  notation: "compact",
  compactDisplay: "short",
  //minimumSignificantDigits: 2
});
