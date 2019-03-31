export interface ModuleOptions {
  preserveState?: boolean;
}

export interface WatchOptions {
  deep?: boolean;
  immediate?: boolean;
}

export interface DispatchOptions {
  root?: boolean;
}

export interface CommitOptions {
  silent?: boolean;
  root?: boolean;
}

export interface Payload {
  type: string;
}

export interface Payload {
  type: string;
}

export interface MutationPayload extends Payload {
  payload: any;
}

export interface Dispatch<Actions> {
  <T>(type: keyof Actions, payload?: T, options?: DispatchOptions): Promise<any>;
  <P extends Payload>(payloadWithType: P, options?: DispatchOptions): Promise<any>;
}

export interface Commit<Mutations> {
  <T>(type: keyof Mutations, payload?: T, options?: CommitOptions): void;
  <P extends Payload>(payloadWithType: P, options?: CommitOptions): void;
}

export type Mutation<State> = <Payload>(state: State, payload?: Payload) => any;

export type MutationTree<State, Mutations> = { [K in keyof Mutations]: Mutation<State> };

export type Getter<State, RootState, Getters, RootGetters> = (
  state: State,
  getters: Getters,
  rootState: RootState,
  rootGetters: RootGetters
) => any;

export type GetterTree<State, RootState, Getters> = {
  [K in keyof Getters]: Getter<State, RootState, Getters[K], Getters>
};

export interface ActionContext<State, RootState, Getters, Mutations, Actions> {
  dispatch: Dispatch<Actions>;
  commit: Commit<Mutations>;
  state: State;
  getters: Getters;
  rootState: RootState;
  rootGetters: any;
}

type ActionHandler<State, RootState, Getters, Mutations, Actions> = <Payload>(
  injectee: ActionContext<State, RootState, Getters, Mutations, Actions>,
  payload: Payload
) => any;

interface ActionObject<State, RootState, Getters, Mutations, Actions> {
  root?: boolean;
  handler: ActionHandler<State, RootState, Getters, Mutations, Actions>;
}

export type Action<State, RootState, Getters, Mutations, Actions> =
  | ActionHandler<State, RootState, Getters, Mutations, Actions>
  | ActionObject<State, RootState, Getters, Mutations, Actions>;

export type ActionTree<State, RootState, Getters, Mutations, Actions> = {
  [K in keyof Actions]: Action<State, RootState, Getters, Mutations, Actions>
};

export interface Module<State, Getters, Mutations, Actions, Modules> {
  namespaced?: boolean;
  state?: State | (() => State);
  getters?: GetterTree<State, any, Getters>;
  mutations?: MutationTree<State, Mutations>;
  actions?: ActionTree<State, any, Getters, Mutations, Actions>;
  modules?: ModuleTree<Modules>;
}

export type ModuleTree<Modules> = {
  [K in keyof Modules]: Module<Modules[K], Modules[K], Modules[K], Modules[K], Modules[K]>
};

/* export type BetterGetter<State, RootState, Getters, Getter> = (
  state: State,
  getters: Getters,
  rootState: RootState,
  rootGetters: any
) => Getter;

export type BetterGetterTree<State, RootState, Getters> = {
  [key in keyof Getters]: BetterGetter<State, RootState, Getters, Getters[key]>
}; */

export interface RootState {
  zraLiteModeEnabled: boolean;
}
