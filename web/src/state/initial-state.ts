import {State} from './app-state';

export function createInitialState(): State {
  return {
    params: {activePath: '', sources: []},
  };
}
