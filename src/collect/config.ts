/** Origin of the plan collection Worker. */
export const PLANS_API = 'https://minha-casinha-plantas.salvi-projects.workers.dev';

/** The gallery's live updates socket, on the same Worker. */
export const PLANS_LIVE_URL = `${PLANS_API.replace(/^http/, 'ws')}/v1/live`;
