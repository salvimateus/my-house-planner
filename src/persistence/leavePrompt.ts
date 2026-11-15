import { createStore, useStore } from 'zustand';

export type LeaveChoice = 'save' | 'discard' | 'cancel';

interface LeavePromptState {
  open: boolean;
  resolve: ((choice: LeaveChoice) => void) | null;
}

const promptStore = createStore<LeavePromptState>()(() => ({ open: false, resolve: null }));

export const useLeavePrompt = (): boolean => useStore(promptStore, (s) => s.open);

/** Asks what to do with the edits of a temporary plan before the editor leaves it. */
export function askLeaveTemporary(): Promise<LeaveChoice> {
  promptStore.getState().resolve?.('cancel');
  return new Promise<LeaveChoice>((resolve) => {
    promptStore.setState({ open: true, resolve });
  });
}

export function answerLeavePrompt(choice: LeaveChoice): void {
  const { resolve } = promptStore.getState();
  promptStore.setState({ open: false, resolve: null });
  resolve?.(choice);
}
