'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  memberTasksControllerOpenTasks,
  taskLabelsControllerCreate,
  taskLabelsControllerRemove,
  taskLabelsControllerUpdate,
  tasksControllerApproveRequest,
  tasksControllerCancelRequest,
  tasksControllerCreate,
  tasksControllerDeclineRequest,
  tasksControllerRemove,
  tasksControllerRequestAssignment,
  tasksControllerUpdate,
} from '@/api/generated';
import {
  changeTaskStatusSchema,
  labelFormSchema,
  taskApiFields,
  taskFormSchema,
  taskPatchSchema,
  toTaskBody,
} from '@/features/tasks/schemas';
import { msg } from '@/i18n/keys';
import { actionClient } from '../action-client';

const id = z.uuid();
/** After a change: the event's task page, and "my tasks", which shows the same tasks. */
function revalidateTasks(eventId: string) {
  revalidatePath(`/events/${eventId}/tasks`);
  revalidatePath('/tasks');
}

/** Bind the event: `createTask.bind(null, eventId)`. */
export const createTask = actionClient
  .metadata({ name: 'createTask', apiFields: taskApiFields })
  .bindArgsSchemas([id])
  .inputSchema(taskFormSchema)
  .action(async ({ parsedInput, bindArgsParsedInputs: [eventId] }) => {
    const { data } = await tasksControllerCreate({
      path: { eventId },
      body: toTaskBody(parsedInput),
    });
    revalidateTasks(eventId);
    return { id: data.id };
  });

/** One inline edit from the task pane (bind event and task): only the fields sent change. */
export const patchTask = actionClient
  .metadata({ name: 'patchTask', apiFields: taskApiFields })
  .bindArgsSchemas([id, id])
  .inputSchema(taskPatchSchema)
  .action(async ({ parsedInput, bindArgsParsedInputs: [eventId, taskId] }) => {
    const body = { ...parsedInput };
    if (body.description === '') body.description = null;
    await tasksControllerUpdate({ path: { eventId, taskId }, body });
    revalidateTasks(eventId);
  });

/** The one change members make to their own tasks; managers use it on the board too. */
export const changeTaskStatus = actionClient
  .metadata({ name: 'changeTaskStatus' })
  .bindArgsSchemas([id, id])
  .inputSchema(changeTaskStatusSchema)
  .action(async ({ parsedInput, bindArgsParsedInputs: [eventId, taskId] }) => {
    await tasksControllerUpdate({ path: { eventId, taskId }, body: parsedInput });
    revalidateTasks(eventId);
  });

/** Nobody has the task anymore: a manager unassigns it, or the assignee gives it back. */
export const unassignTask = actionClient
  .metadata({ name: 'unassignTask' })
  .bindArgsSchemas([id, id])
  .action(async ({ bindArgsParsedInputs: [eventId, taskId] }) => {
    await tasksControllerUpdate({
      path: { eventId, taskId },
      body: { assigneeUserId: null, assigneeName: null },
    });
    revalidateTasks(eventId);
  });

export const deleteTask = actionClient
  .metadata({ name: 'deleteTask' })
  .bindArgsSchemas([id, id])
  .action(async ({ bindArgsParsedInputs: [eventId, taskId] }) => {
    await tasksControllerRemove({ path: { eventId, taskId } });
    revalidateTasks(eventId);
  });

export const requestTask = actionClient
  .metadata({ name: 'requestTask', conflictMessage: msg('tasks.requestConflict') })
  .bindArgsSchemas([id, id])
  .action(async ({ bindArgsParsedInputs: [eventId, taskId] }) => {
    await tasksControllerRequestAssignment({ path: { eventId, taskId } });
    revalidateTasks(eventId);
  });

export const cancelTaskRequest = actionClient
  .metadata({ name: 'cancelTaskRequest' })
  .bindArgsSchemas([id, id])
  .action(async ({ bindArgsParsedInputs: [eventId, taskId] }) => {
    await tasksControllerCancelRequest({ path: { eventId, taskId } });
    revalidateTasks(eventId);
  });

/** Bind the event, the task and the request. */
export const approveTaskRequest = actionClient
  .metadata({ name: 'approveTaskRequest' })
  .bindArgsSchemas([id, id, id])
  .action(async ({ bindArgsParsedInputs: [eventId, taskId, requestId] }) => {
    await tasksControllerApproveRequest({ path: { eventId, taskId, requestId } });
    revalidateTasks(eventId);
  });

export const declineTaskRequest = actionClient
  .metadata({ name: 'declineTaskRequest' })
  .bindArgsSchemas([id, id, id])
  .action(async ({ bindArgsParsedInputs: [eventId, taskId, requestId] }) => {
    await tasksControllerDeclineRequest({ path: { eventId, taskId, requestId } });
    revalidateTasks(eventId);
  });

/** Bind the event. Returns the label, so the task form can select it right away. */
export const createTaskLabel = actionClient
  .metadata({ name: 'createTaskLabel', conflictMessage: msg('taskLabels.nameTaken') })
  .bindArgsSchemas([id])
  .inputSchema(labelFormSchema)
  .action(async ({ parsedInput, bindArgsParsedInputs: [eventId] }) => {
    const { data } = await taskLabelsControllerCreate({ path: { eventId }, body: parsedInput });
    revalidateTasks(eventId);
    return data;
  });

export const updateTaskLabel = actionClient
  .metadata({ name: 'updateTaskLabel', conflictMessage: msg('taskLabels.nameTaken') })
  .bindArgsSchemas([id, id])
  .inputSchema(labelFormSchema)
  .action(async ({ parsedInput, bindArgsParsedInputs: [eventId, labelId] }) => {
    await taskLabelsControllerUpdate({ path: { eventId, labelId }, body: parsedInput });
    revalidateTasks(eventId);
  });

export const deleteTaskLabel = actionClient
  .metadata({ name: 'deleteTaskLabel' })
  .bindArgsSchemas([id, id])
  .action(async ({ bindArgsParsedInputs: [eventId, labelId] }) => {
    await taskLabelsControllerRemove({ path: { eventId, labelId } });
    revalidateTasks(eventId);
  });

/** A member's unfinished tasks per event, asked for before removing them from the organization. */
export const getOpenTaskCounts = actionClient
  .metadata({ name: 'getOpenTaskCounts' })
  .bindArgsSchemas([z.string().min(1)])
  .action(async ({ bindArgsParsedInputs: [userId] }) => {
    const { data } = await memberTasksControllerOpenTasks({ path: { userId } });
    return data;
  });
