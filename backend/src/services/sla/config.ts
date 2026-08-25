import { BusinessHoursConfig } from "./businessHours";

export function buildBusinessHoursConfig(holidayDates: string[]): BusinessHoursConfig {
  return {
    timezone: process.env.BUSINESS_TIMEZONE ?? "Asia/Kolkata",
    startHour: 9,
    endHour: 18,
    holidays: new Set(holidayDates),
  };
}
