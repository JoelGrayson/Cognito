/** What someone on the waitlist says they are studying. Shared by the form and the route. */
export const STUDYING = ["High school math", "College math", "Chemistry", "Something else"] as const;
export type Studying = (typeof STUDYING)[number];
