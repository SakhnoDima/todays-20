import { daysOfWeek } from "../constants/index.js";

export const delayer = (time) =>
  new Promise((resolve) => setTimeout(resolve, time));

export const getCurrentDayOfWeek = () => {
  return daysOfWeek[new Date().getDay()];
};
