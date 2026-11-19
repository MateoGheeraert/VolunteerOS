import 'server-only';
import { planningControllerBoard, publicRegistrationControllerGet } from '@/api/generated';
import { query } from '../query';

/** The planning board: teams, shifts with coverage, applications with their assignments. */
export const getPlanning = (eventId: string) =>
  query(planningControllerBoard({ path: { eventId } }));

/** The public registration page's event. An unknown link is a 404. */
export const getPublicEvent = (slug: string) =>
  query(publicRegistrationControllerGet({ path: { slug } }));
