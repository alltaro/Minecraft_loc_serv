import { defineEventHandler } from 'h3';

export default defineEventHandler(async (event) => {
  // send no cookie
  return { message: 'Logged out successfully' };
});
