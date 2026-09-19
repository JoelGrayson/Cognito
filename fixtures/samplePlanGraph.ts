import type { Edge, PlanGraph, PlanNode } from "@/types/learning";

const container = (id: string, title: string, summary: string, objective: string): PlanNode => ({
  id, title, summary, kind: "core", estMinutes: 0, scope: "included", objectives: [objective],
});

const leaf = (
  id: string, parentId: string, title: string, summary: string, estMinutes: number, objectives: string[],
): PlanNode => ({ id, parentId, title, summary, kind: "core", estMinutes, scope: "included", objectives });

const optional = (
  id: string, title: string, summary: string, estMinutes: number, objectives: string[],
): PlanNode => ({ id, title, summary, kind: "optional", estMinutes, scope: "included", objectives });

const prerequisite = (source: string, target: string): Edge => ({
  id: `${source}__${target}`, source, target, kind: "prerequisite",
});

// 25 nodes: 6 core containers, 17 leaves under them (3 + 3 + 3 + 3 + 3 + 2), and 2 optional leaves.
export const samplePlanGraph: PlanGraph = {
  title: "Linear algebra for neural networks",
  nodes: [
    container("vectors", "Vectors", "The basic objects of linear algebra.", "Use vectors to represent data and directions"),
    leaf("vector_basics", "vectors", "Vector basics", "Components, addition, scaling.", 45, [
      "Explain a vector as both an arrow and a list of numbers",
      "Compute sums and scalar multiples by hand",
    ]),
    leaf("dot_product", "vectors", "Dot product", "Measuring alignment between vectors.", 60, [
      "Compute a dot product and interpret its sign",
      "Relate the dot product to the angle between vectors",
    ]),
    leaf("norms", "vectors", "Norms and distance", "Length and distance in vector space.", 45, [
      "Compare L1 and L2 norms",
      "Compute the distance between two vectors",
    ]),

    container("matrices", "Matrices", "Grids of numbers that act on vectors.", "Use matrices to organize and transform data"),
    leaf("matrix_basics", "matrices", "Matrix basics", "Shapes, entries, and simple operations.", 45, [
      "Read the shape of a matrix and index its entries",
      "Add and scale matrices",
    ]),
    leaf("matrix_multiplication", "matrices", "Matrix multiplication", "Rows times columns, and why it works.", 75, [
      "Multiply two matrices by hand",
      "Explain why matrix multiplication is not commutative",
    ]),
    leaf("transpose_inverse", "matrices", "Transpose and inverse", "Flipping and undoing a matrix.", 60, [
      "Compute a transpose and state its properties",
      "Decide when a matrix has an inverse",
    ]),

    container("linear_maps", "Linear transformations", "Matrices as functions on space.", "Describe what a matrix does to space"),
    leaf("matrix_as_map", "linear_maps", "Matrices as transformations", "Rotation, scaling, and shear.", 60, [
      "Predict the effect of a 2x2 matrix on the unit square",
      "Compose two transformations as a matrix product",
    ]),
    leaf("span_basis", "linear_maps", "Span and basis", "What a set of vectors can reach.", 60, [
      "Decide whether vectors are linearly independent",
      "Express a vector in a given basis",
    ]),
    leaf("rank_null", "linear_maps", "Rank and null space", "Information kept and lost.", 60, [
      "Compute the rank of a small matrix",
      "Explain what the null space tells you",
    ]),

    container("decompositions", "Eigenvalues and SVD", "Finding the structure inside a matrix.", "Use decompositions to simplify a matrix"),
    leaf("eigen", "decompositions", "Eigenvectors and eigenvalues", "Directions a matrix only stretches.", 75, [
      "Compute eigenvalues of a 2x2 matrix",
      "Interpret an eigenvector geometrically",
    ]),
    leaf("svd", "decompositions", "Singular value decomposition", "Any matrix as rotate, stretch, rotate.", 90, [
      "State what the three factors of an SVD represent",
      "Explain low-rank approximation using an SVD",
    ]),
    leaf("pca", "decompositions", "Principal components", "Finding the directions that matter.", 60, [
      "Explain PCA as an SVD of centered data",
      "Choose how many components to keep",
    ]),

    container("gradients", "Multivariable calculus", "Derivatives with many inputs.", "Compute how a function changes in every direction"),
    leaf("partial_derivatives", "gradients", "Partial derivatives", "Changing one input at a time.", 60, [
      "Compute partial derivatives of a two-variable function",
      "Interpret a partial derivative as a rate of change",
    ]),
    leaf("gradient_descent", "gradients", "Gradients and gradient descent", "Following the slope downhill.", 75, [
      "Explain why the gradient points uphill",
      "Run three steps of gradient descent by hand",
    ]),
    leaf("chain_rule", "gradients", "The chain rule", "Derivatives of composed functions.", 60, [
      "Apply the chain rule to a composition of two functions",
      "Compute a Jacobian-vector product for a small example",
    ]),

    container("nn_math", "Math of neural networks", "Putting it together.", "Trace the math of a small network end to end"),
    leaf("forward_pass", "nn_math", "The forward pass", "Layers as matrix multiplications.", 75, [
      "Write a two-layer forward pass as matrix products",
      "Explain the role of the nonlinearity",
    ]),
    leaf("backprop", "nn_math", "Backpropagation", "The chain rule over a network.", 90, [
      "Derive the gradient of the loss for a single layer",
      "Explain why backpropagation reuses intermediate values",
    ]),

    optional("tensors", "Tensors in practice", "Higher-dimensional arrays and broadcasting.", 45, [
      "Explain broadcasting with a concrete example",
    ]),
    optional("probability_refresher", "Probability refresher", "Just enough for loss functions.", 60, [
      "Explain how cross-entropy loss relates to probability",
    ]),
  ],
  edges: [
    prerequisite("vectors", "matrices"),
    prerequisite("matrices", "linear_maps"),
    prerequisite("linear_maps", "decompositions"),
    prerequisite("linear_maps", "gradients"),
    prerequisite("decompositions", "nn_math"),
    prerequisite("gradients", "nn_math"),
    { id: "matrices__tensors", source: "matrices", target: "tensors", kind: "related" },
    { id: "gradients__probability_refresher", source: "gradients", target: "probability_refresher", kind: "related" },
  ],
};
