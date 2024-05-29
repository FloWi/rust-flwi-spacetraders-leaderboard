import {type ClassValue, clsx} from "clsx";
import {twMerge} from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function zip<T, U>(a: T[], b: U[]): [T, U][] {
  const length = Math.min(a.length, b.length);
  const result: [T, U][] = [];
  for (let i = 0; i < length; i++) {
    result.push([a[i], b[i]]);
  }
  return result;
}

export function zipRepeat2nd<T, U>(a: T[], b: U[]): [T, U][] {
  const length = Math.min(a.length);
  const result: [T, U][] = [];
  for (let i = 0; i < length; i++) {
    result.push([a[i], b[i % b.length]]);
  }
  return result;
}

export function durationMillis(from: Date, to: Date): number {
  console.log("durationMillis", "from", from, typeof (from), "to", to, typeof (to));
  return to.getTime() - from.getTime();
}
