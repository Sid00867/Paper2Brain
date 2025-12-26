// diagramData.js

export const groups = [
  // {
  //   id: "1",
  //   label: "Inference Engine",
  //   color: "#e3f2fd", // Light Blue
  //   info: "The Inference Engine is a crucial module in the PlaNet architecture, responsible for predicting the future states and rewards. It comprises the Encoder, Transition Model, Observation Model, and Reward Model. The collective function of this module is to provide the necessary information for the Planning Algorithm to make informed decisions."
  // },
  // {
  //   id: "2",
  //   label: "Planning Module",
  //   color: "#fff3e0", // Light Orange
  //   info: "The Planning Module is a critical component of the PlaNet architecture, responsible for selecting the best action using the predicted latent states and rewards. The Planning Algorithm uses the Transition Model, Observation Model, and Reward Model to predict future outcomes and optimize behavior."
  // },
  // {
  //   id: "3",
  //   label: "State Representation",
  //   color: "#e8f5e9", // Light Green
  //   info: "The State Representation module consists of the Latent State and Deterministic State, which represent the hidden state of the environment. The collective function of this module is to provide a compact and informative representation of the environment's state."
  // }
];

export const nodes = [
  // --- Group 1: Inference Engine ---
  // { 
  //   id: "Encoder", 
  //   label: "Encoder", 
  //   parent: "1", 
  //   color: "#bbdefb", 
  //   info: "Infers the latent state from the observation and action history. It is a convolutional neural network (CNN) followed by a fully connected layer." 
  // },
  // { 
  //   id: "Transition Model", 
  //   label: "Transition Model", 
  //   parent: "1", 
  //   color: "#bbdefb", 
  //   info: "Predicts the next latent state given the current latent state and action. It is a Gaussian distribution with a predicted mean and standard deviation." 
  // },
  // { 
  //   id: "Observation Model", 
  //   label: "Observation Model", 
  //   parent: "1", 
  //   color: "#bbdefb", 
  //   info: "Predicts the observation given the latent state. It is a Gaussian distribution with a predicted mean and standard deviation." 
  // },
  // { 
  //   id: "Reward Model", 
  //   label: "Reward Model", 
  //   parent: "1", 
  //   color: "#bbdefb", 
  //   info: "Predicts the reward given the latent state. It is a scalar Gaussian distribution with a predicted mean and standard deviation." 
  // },

  // // --- Group 2: Planning Module ---
  // { 
  //   id: "Planning Algorithm", 
  //   label: "Planning Algorithm", 
  //   parent: "2", 
  //   color: "#ffcc80", 
  //   info: "Selects the action using the predicted latent states and rewards. It uses the Cross-Entropy Method (CEM) with a planning horizon of 12 time steps." 
  // },

  // // --- Group 3: State Representation ---
  // { 
  //   id: "Latent State", 
  //   label: "Latent State", 
  //   parent: "3", 
  //   color: "#a5d6a7", 
  //   info: "Represents the hidden state of the environment. It is a stochastic variable (diagonal Gaussian) capturing uncertainty, with a dimensionality of 30." 
  // },
  // { 
  //   id: "Deterministic State", 
  //   label: "Deterministic State", 
  //   parent: "3", 
  //   color: "#a5d6a7", 
  //   info: "Represents the deterministic part of the state using an RNN with 200 units. It allows the model to access all previous states deterministically." 
  // },

  // // --- Ungrouped Nodes ---
  // { 
  //   id: "Action", 
  //   label: "Action", 
  //   color: "#ffffff", 
  //   info: "Represents the action taken by the agent. It is a continuous action vector selected by the Planning Algorithm." 
  // },
  // { 
  //   id: "Observation", 
  //   label: "Observation", 
  //   color: "#ffffff", 
  //   info: "Represents the observation received from the environment (64x64x3 image). It is pre-processed by reducing the bit depth to 5 bits." 
  // },
  // { 
  //   id: "Reward", 
  //   label: "Reward", 
  //   color: "#ffffff", 
  //   info: "Represents the scalar reward received from the environment. It is used to evaluate the quality of the action sequence." 
  // }
];

export const links = [
  // { source: "Latent State", target: "Observation Model", label: "predicts observation", info: "The Latent State is used to predict the observation through the Observation Model." },
  // { source: "Latent State", target: "Reward Model", label: "predicts reward", info: "The Latent State is used to predict the reward through the Reward Model." },
  // { source: "Transition Model", target: "Latent State", label: "predicts next latent state", info: "The Transition Model predicts the next Latent State based on the current state and action." },
  // { source: "Action", target: "Transition Model", label: "influences next latent state", info: "The Action influences the state transition dynamics." },
  // { source: "Observation", target: "Encoder", label: "infers latent state", info: "The Observation is encoded to infer the underlying Latent State." },
  // { source: "Action", target: "Encoder", label: "infers latent state", info: "Past actions are used by the Encoder to help infer the current state." },
  // { source: "Encoder", target: "Latent State", label: "infers latent state", info: "The Encoder outputs the inferred Latent State distribution." },
  // { source: "Planning Algorithm", target: "Action", label: "selects action", info: "The Planning Algorithm selects the optimal Action to take." },
  // { source: "Transition Model", target: "Planning Algorithm", label: "predicts future latent states", info: "Used by the planner to simulate future trajectories." },
  // { source: "Observation Model", target: "Planning Algorithm", label: "predicts future observations", info: "Used by the planner to visualize or evaluate future states." },
  // { source: "Reward Model", target: "Planning Algorithm", label: "predicts future rewards", info: "Used by the planner to evaluate the expected return of trajectories." },
  // { source: "Planning Algorithm", target: "Transition Model", label: "refines plan", info: "The planner iteratively queries the model to refine the action sequence." },
  // { source: "Observation", target: "Planning Algorithm", label: "influences plan", info: "Current observations ground the planning process." },
  // { source: "Action", target: "Planning Algorithm", label: "influences plan", info: "Past actions inform the planner's starting state." },
  // { source: "Latent State", target: "Planning Algorithm", label: "influences plan", info: "The current latent state is the starting point for planning." },
  // { source: "Transition Model", target: "Encoder", label: "latent overshooting objective", info: "Consistency objective between multi-step predictions and single-step encoding." },
  // { source: "Encoder", target: "Transition Model", label: "latent overshooting objective", info: "Ensures the transition model stays consistent with the encoder's grounded beliefs." },
  // { source: "Deterministic State", target: "Transition Model", label: "influences next latent state", info: "The RNN state provides long-term context for the transition." },
  // { source: "Action", target: "Latent State", label: "influences current latent state", info: "Actions directly affect the evolution of the latent state." },
  // { source: "Latent State", target: "Deterministic State", label: "updates deterministic state", info: "The stochastic state is fed into the RNN to update its deterministic memory." },
  // { source: "Deterministic State", target: "Latent State", label: "influences current latent state", info: "The deterministic memory provides prior context for the current latent variable." },
  // { source: "Observation", target: "Latent State", label: "influences current latent state", info: "Observations update the belief about the current latent state." },
  // { source: "Reward", target: "Planning Algorithm", label: "evaluation criterion", info: "Real rewards are used to evaluate the success of the plan." }
];