import debug = require("debug");
import moment = require("moment-timezone");
import { AllParks, Park, ScheduleData } from "themeparks";
import {
  IParkOperatingHours,
  IRideFastPassTime,
  IRideWaitTime
} from "../models";

const log = debug("services:parks");

// Map of theme park name to class.
const parksMap = new Map<string, Park>(
  AllParks.map(ParkClass => {
    // Creating to get name of park.
    const park = new ParkClass();

    // TODO: This seems smelly that storing all created Park objects.
    return [park.Name, park] as [string, Park];
  })
);

const names: string[] = [];

for (const key of parksMap.keys()) {
  names.push(key);
}

function stringSort(a: string, b: string) {
  if (a < b) {
    return -1;
  }

  if (a > b) {
    return 1;
  }

  return 0;
}

export const parkNames: ReadonlyArray<string> = names.sort(stringSort);

export async function getOperatingHours(
  parkName: string,
  date: moment.Moment
): Promise<IParkOperatingHours | null> {
  // Removing undefined.
  const park = parksMap.get(parkName)!;

  let filteredSchedules: ScheduleData[] | null = null;

  try {
    const openingTimes = await park.GetOpeningTimesPromise();

    filteredSchedules = openingTimes.filter(schedule => {
      return moment(schedule.date).isSame(date);
    });
  } catch (e) {
    log(e);
  }

  if (filteredSchedules !== null && filteredSchedules.length > 0) {
    const schedule = filteredSchedules[0];

    const opening = moment.tz(schedule.openingTime, park.Timezone);
    const closing = moment.tz(schedule.closingTime, park.Timezone);

    let additionalHours;

    if (schedule.special !== undefined) {
      additionalHours = schedule.special.map(s => {
        return {
          closing: moment.tz(s.closingTime, park.Timezone),
          description: s.type,
          opening: moment.tz(s.openingTime, park.Timezone)
        };
      });
    }

    let isOpen = false;

    if (schedule.type === "Operating") {
      const currentTimeInTimeZone = moment().tz(park.Timezone);

      isOpen = currentTimeInTimeZone.isBetween(opening, closing);

      if (
        !isOpen &&
        additionalHours &&
        additionalHours.find(a =>
          currentTimeInTimeZone.isBetween(a.opening, a.closing)
        )
      ) {
        // Current time is outside the normal park operating hours, if there are additional hours then
        // try find one for current time. If there is, then it is open.
        isOpen = true;
      }
    }

    return {
      additionalHours,
      closing,
      date,
      isOpen,
      opening
    };
  } else {
    return null;
  }
}

export async function getWaitTimes(
  parkName: string
): Promise<IRideWaitTime[] | null> {
  // Removing undefined
  const park = parksMap.get(parkName)!;

  let waitTimes: IRideWaitTime[] | null = null;

  try {
    const times = await park.GetWaitTimesPromise();

    if (times !== null) {
      waitTimes = times.map(w => {
        return {
          isRunning: w.active,
          name: w.name,
          waitTime: w.waitTime
        };
      });

      waitTimes = waitTimes.sort((a, b) => stringSort(a.name, b.name));
    }
  } catch (e) {
    log(e);
  }

  return waitTimes;
}

export function supportsFastPass(parkName: string) {
  const park = parksMap.get(parkName)!;

  return park.FastPass;
}

export async function getFastPassTimes(
  parkName: string
): Promise<IRideFastPassTime[] | null> {
  const park = parksMap.get(parkName) as Park;

  let fastPassTimes: IRideFastPassTime[] | null = null;

  try {
    const times = await park.GetWaitTimesPromise();

    if (times !== null) {
      const ridesThatSupportFastPass = times.filter(wt => wt.fastPass === true);

      fastPassTimes = ridesThatSupportFastPass.map(wt => {
        let isAvailable = false;
        let startTime: moment.Moment | null = null;
        let endTime: moment.Moment | null = null;

        return {
          name: wt.name,
          isAvailable,
          startTime,
          endTime
        };
      });

      fastPassTimes = fastPassTimes.sort((a, b) => stringSort(a.name, b.name));
    }
  } catch (e) {
    log(e);
  }

  return fastPassTimes;
}
