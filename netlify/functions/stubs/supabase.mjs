export const storyUpdates = [];
export const jobUpdates = [];

export async function updateAgentStory(_id, data) {
  storyUpdates.push(data);
  return data;
}

export async function createBackgroundJobLog() {
  return { id: 7 };
}

export async function appendBackgroundJobLogEntry() {}

export async function updateBackgroundJobLog(_id, data) {
  jobUpdates.push(data);
}
