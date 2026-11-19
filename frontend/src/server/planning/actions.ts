'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  planningControllerAssign,
  planningControllerConfirm,
  planningControllerConfirmAll,
  planningControllerCreateApplication,
  planningControllerCreateShift,
  planningControllerCreateTeam,
  planningControllerMove,
  planningControllerNotify,
  planningControllerPreview,
  planningControllerPublish,
  planningControllerRemoveApplication,
  planningControllerRemoveShift,
  planningControllerRemoveTeam,
  planningControllerUnassign,
  planningControllerUpdateApplication,
  planningControllerUpdateRegistration,
  planningControllerUpdateShift,
  planningControllerUpdateTeam,
  publicRegistrationControllerRegister,
} from '@/api/generated';
import {
  assignSchema,
  moveSchema,
  publicRegistrationFormSchema,
  publishSchema,
  registrationFormSchema,
  shiftApiFields,
  shiftFormSchema,
  teamFormSchema,
  toPublicRegistrationBody,
  toRegistrationBody,
  toShiftBody,
  toVolunteerBody,
  volunteerApiFields,
  volunteerFormSchema,
} from '@/features/planning/schemas';
import { msg } from '@/i18n/keys';
import { actionClient } from '../action-client';

const id = z.uuid();
const confirmedSchema = z.object({ confirmed: z.boolean() });

const revalidatePlanning = (eventId: string) => revalidatePath(`/events/${eventId}/planning`);

// ── Teams ──────────────────────────────────────────────────────────────────────────────────────

/** Bind the event. */
export const createTeam = actionClient
  .metadata({ name: 'createTeam', conflictMessage: msg('planning.teams.nameTaken') })
  .bindArgsSchemas([id])
  .inputSchema(teamFormSchema)
  .action(async ({ parsedInput, bindArgsParsedInputs: [eventId] }) => {
    const { data } = await planningControllerCreateTeam({
      path: { eventId },
      body: {
        name: parsedInput.name,
        description: parsedInput.description || null,
        defaultMeetingPoint: parsedInput.defaultMeetingPoint || null,
      },
    });
    revalidatePlanning(eventId);
    return { id: data.id };
  });

/** Bind the event and the team. */
export const updateTeam = actionClient
  .metadata({ name: 'updateTeam', conflictMessage: msg('planning.teams.nameTaken') })
  .bindArgsSchemas([id, id])
  .inputSchema(teamFormSchema)
  .action(async ({ parsedInput, bindArgsParsedInputs: [eventId, teamId] }) => {
    await planningControllerUpdateTeam({
      path: { eventId, teamId },
      body: {
        name: parsedInput.name,
        description: parsedInput.description || null,
        defaultMeetingPoint: parsedInput.defaultMeetingPoint || null,
      },
    });
    revalidatePlanning(eventId);
  });

export const deleteTeam = actionClient
  .metadata({ name: 'deleteTeam', conflictMessage: msg('planning.confirmedWouldGo') })
  .bindArgsSchemas([id, id])
  .inputSchema(confirmedSchema)
  .action(async ({ parsedInput, bindArgsParsedInputs: [eventId, teamId] }) => {
    await planningControllerRemoveTeam({
      path: { eventId, teamId },
      query: { confirmed: parsedInput.confirmed ? 'true' : 'false' },
    });
    revalidatePlanning(eventId);
  });

// ── Shifts ─────────────────────────────────────────────────────────────────────────────────────

export const createShift = actionClient
  .metadata({ name: 'createShift', apiFields: shiftApiFields })
  .bindArgsSchemas([id])
  .inputSchema(shiftFormSchema)
  .action(async ({ parsedInput, bindArgsParsedInputs: [eventId] }) => {
    const { data } = await planningControllerCreateShift({
      path: { eventId },
      body: toShiftBody(parsedInput),
    });
    revalidatePlanning(eventId);
    return { id: data.id };
  });

export const updateShift = actionClient
  .metadata({ name: 'updateShift', apiFields: shiftApiFields })
  .bindArgsSchemas([id, id])
  .inputSchema(shiftFormSchema)
  .action(async ({ parsedInput, bindArgsParsedInputs: [eventId, shiftId] }) => {
    await planningControllerUpdateShift({
      path: { eventId, shiftId },
      body: toShiftBody(parsedInput),
    });
    revalidatePlanning(eventId);
  });

export const deleteShift = actionClient
  .metadata({ name: 'deleteShift', conflictMessage: msg('planning.confirmedWouldGo') })
  .bindArgsSchemas([id, id])
  .inputSchema(confirmedSchema)
  .action(async ({ parsedInput, bindArgsParsedInputs: [eventId, shiftId] }) => {
    await planningControllerRemoveShift({
      path: { eventId, shiftId },
      query: { confirmed: parsedInput.confirmed ? 'true' : 'false' },
    });
    revalidatePlanning(eventId);
  });

// ── Volunteers ─────────────────────────────────────────────────────────────────────────────────

export const createVolunteer = actionClient
  .metadata({
    name: 'createVolunteer',
    apiFields: volunteerApiFields,
    conflictMessage: msg('planning.volunteers.alreadyListed'),
  })
  .bindArgsSchemas([id])
  .inputSchema(volunteerFormSchema)
  .action(async ({ parsedInput, bindArgsParsedInputs: [eventId] }) => {
    await planningControllerCreateApplication({
      path: { eventId },
      body: toVolunteerBody(parsedInput),
    });
    revalidatePlanning(eventId);
  });

export const updateVolunteer = actionClient
  .metadata({
    name: 'updateVolunteer',
    apiFields: volunteerApiFields,
    conflictMessage: msg('planning.volunteers.emailTaken'),
  })
  .bindArgsSchemas([id, id])
  .inputSchema(volunteerFormSchema)
  .action(async ({ parsedInput, bindArgsParsedInputs: [eventId, applicationId] }) => {
    await planningControllerUpdateApplication({
      path: { eventId, applicationId },
      body: toVolunteerBody(parsedInput),
    });
    revalidatePlanning(eventId);
  });

export const deleteVolunteer = actionClient
  .metadata({ name: 'deleteVolunteer', conflictMessage: msg('planning.confirmedWouldGo') })
  .bindArgsSchemas([id, id])
  .inputSchema(confirmedSchema)
  .action(async ({ parsedInput, bindArgsParsedInputs: [eventId, applicationId] }) => {
    await planningControllerRemoveApplication({
      path: { eventId, applicationId },
      query: { confirmed: parsedInput.confirmed ? 'true' : 'false' },
    });
    revalidatePlanning(eventId);
  });

// ── Assignments ────────────────────────────────────────────────────────────────────────────────

/** The board checks overlaps and warnings first; a 409 here means the board was out of date. */
export const assignVolunteer = actionClient
  .metadata({ name: 'assignVolunteer', conflictMessage: msg('planning.board.assignConflict') })
  .bindArgsSchemas([id])
  .inputSchema(assignSchema)
  .action(async ({ parsedInput, bindArgsParsedInputs: [eventId] }) => {
    await planningControllerAssign({ path: { eventId }, body: parsedInput });
    revalidatePlanning(eventId);
  });

export const moveAssignment = actionClient
  .metadata({ name: 'moveAssignment', conflictMessage: msg('planning.board.assignConflict') })
  .bindArgsSchemas([id, id])
  .inputSchema(moveSchema)
  .action(async ({ parsedInput, bindArgsParsedInputs: [eventId, assignmentId] }) => {
    await planningControllerMove({ path: { eventId, assignmentId }, body: parsedInput });
    revalidatePlanning(eventId);
  });

export const confirmAssignment = actionClient
  .metadata({ name: 'confirmAssignment' })
  .bindArgsSchemas([id, id])
  .action(async ({ bindArgsParsedInputs: [eventId, assignmentId] }) => {
    await planningControllerConfirm({ path: { eventId, assignmentId } });
    revalidatePlanning(eventId);
  });

export const confirmAllAssignments = actionClient
  .metadata({ name: 'confirmAllAssignments' })
  .bindArgsSchemas([id])
  .action(async ({ bindArgsParsedInputs: [eventId] }) => {
    const { data } = await planningControllerConfirmAll({ path: { eventId } });
    revalidatePlanning(eventId);
    return data;
  });

export const unassign = actionClient
  .metadata({ name: 'unassign' })
  .bindArgsSchemas([id, id])
  .action(async ({ bindArgsParsedInputs: [eventId, assignmentId] }) => {
    await planningControllerUnassign({ path: { eventId, assignmentId } });
    revalidatePlanning(eventId);
  });

// ── Registration and publishing ────────────────────────────────────────────────────────────────

export const updateRegistration = actionClient
  .metadata({ name: 'updateRegistration', apiFields: { registrationDeadline: 'deadlineTime' } })
  .bindArgsSchemas([id])
  .inputSchema(registrationFormSchema)
  .action(async ({ parsedInput, bindArgsParsedInputs: [eventId] }) => {
    await planningControllerUpdateRegistration({
      path: { eventId },
      body: toRegistrationBody(parsedInput),
    });
    revalidatePath(`/events/${eventId}`, 'layout');
  });

/** After the schedule was sent: tell one volunteer about their changed shifts. */
export const notifyVolunteer = actionClient
  .metadata({ name: 'notifyVolunteer', conflictMessage: msg('planning.notify.nothingChanged') })
  .bindArgsSchemas([id, id])
  .action(async ({ bindArgsParsedInputs: [eventId, applicationId] }) => {
    const { data } = await planningControllerNotify({ path: { eventId, applicationId } });
    revalidatePlanning(eventId);
    return data;
  });

/** What publishing now would send, for the publish dialog. */
export const loadSchedulePreview = actionClient
  .metadata({ name: 'loadSchedulePreview' })
  .bindArgsSchemas([id])
  .action(async ({ bindArgsParsedInputs: [eventId] }) => {
    const { data } = await planningControllerPreview({ path: { eventId } });
    return data;
  });

export const publishSchedule = actionClient
  .metadata({ name: 'publishSchedule', conflictMessage: msg('planning.publish.alreadySent') })
  .bindArgsSchemas([id])
  .inputSchema(publishSchema)
  .action(async ({ parsedInput, bindArgsParsedInputs: [eventId] }) => {
    const { data } = await planningControllerPublish({ path: { eventId }, body: parsedInput });
    revalidatePlanning(eventId);
    return data;
  });

// ── Public registration (no session) ───────────────────────────────────────────────────────────

/** Bind the slug. */
export const registerVolunteer = actionClient
  .metadata({
    name: 'registerVolunteer',
    apiFields: { availableShiftIds: 'availableShiftIds', wholeEvent: 'wholeEvent' },
    conflictMessage: msg('register.closedNow'),
  })
  .bindArgsSchemas([z.string().min(1).max(200)])
  .inputSchema(publicRegistrationFormSchema)
  .action(async ({ parsedInput, bindArgsParsedInputs: [slug] }) => {
    await publicRegistrationControllerRegister({
      path: { slug },
      body: toPublicRegistrationBody(parsedInput),
    });
  });
