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

export type Plugin<State, Mutations, Getters, Actions, Modules> = (
  store: Store<State, Mutations, Getters, Actions, Modules>
) => any;

export interface StoreOptions<State, Mutations, Getters, Actions, Modules> {
  state?: State;
  getters?: GetterTree<State, State, Getters>;
  mutations?: MutationTree<State, Mutations>;
  actions?: ActionTree<State, State, Getters, Mutations, Actions>;
  modules?: ModuleTree<Modules>;
  plugins?: Plugin<State, Mutations, Getters, Actions, Modules>[];
  strict?: boolean;
}

class Store<State, Mutations, Getters, Actions, Modules> {
  constructor(options: StoreOptions<State, Mutations, Getters, Actions, Modules>) {}

  readonly state: State;
  // trying to add this to test whether we could at least
  // get the types from a regular modules property
  readonly modules: Modules;
  readonly getters: Getters;

  replaceState: (state: State) => void;

  commit: Commit<Mutations>;
  dispatch: Dispatch<Actions>;

  subscribe: <P extends MutationPayload>(fn: (mutation: P, state: State) => any) => () => void;
  watch: <T>(
    getter: (state: State) => T,
    cb: (value: T, oldValue: T) => void,
    options?: WatchOptions
  ) => () => void;

  registerModule: <
    ModuleState,
    ModuleGetters,
    ModuleMutations,
    ModuleActions,
    ModuleModules extends ModuleTree<ModuleModules>
  >(
    path: string,
    module: Module<ModuleState, ModuleGetters, ModuleMutations, ModuleActions, ModuleModules>,
    options?: ModuleOptions
  ) => void;

  registerModulePath: <
    ModuleState,
    ModuleGetters,
    ModuleMutations,
    ModuleActions,
    ModuleModules extends ModuleTree<ModuleModules>
  >(
    path: string[],
    module: Module<ModuleState, ModuleGetters, ModuleMutations, ModuleActions, ModuleModules>,
    options?: ModuleOptions
  ) => void;

  // this could be type safe as well, since we're dealing with existing paths
  // but i didn't bother since the whole module concept isn't working :(
  unregisterModule: (path: string) => void;
  unregisterModulePath: (path: string[]) => void;
}

const simpleStoreObject = new Store({
  state: {
    count: 0,
    countString: '1',
  },
  mutations: {
    decrement: state => state.count,
  },
  getters: {
    isCountAt10: (state): boolean => {
      return state.count === 10;
    },
  },
  actions: {
    decrementAsync: context => {
      setTimeout(() => {
        context.commit('decrement');
      }, 0);
    },
  },
});

simpleStoreObject.state.count;
simpleStoreObject.state.countString;
simpleStoreObject.state.error;
simpleStoreObject.commit('increment');
simpleStoreObject.commit('decrement');
simpleStoreObject.getters.isCountAt10;
simpleStoreObject.getters.iDontExist;
simpleStoreObject.replaceState({ count: 1, countString: '123123' });
simpleStoreObject.replaceState({ count: '1', countString: 123123 });
simpleStoreObject.dispatch('incrementAsync');
simpleStoreObject.dispatch('decrementAsync');
simpleStoreObject.modules.a.state.propA;

simpleStoreObject.dispatch('decrementAsync');

// nothing works for modules
// if I had a Pick in TS that instead of returning me an object that
// contains the property, I could just get the value of that property
// maybe it'd work

const fractalStoreObject = new Store({
  modules: {
    a: {
      state: {
        propA: '123',
      },
      mutations: {
        updatePropA: (state, payload) => (state.propA = payload),
      },
      getters: {
        isPropA123: (state): boolean => state.propA === '123',
      },
    },
    b: {
      state: {
        propB: 123,
      },
      mutations: {
        updatePropB: (state, payload) => (state.propB = payload),
      },
      getters: {
        isPropB123: (state): boolean => state.propB === 123,
      },
    },
  },
});
