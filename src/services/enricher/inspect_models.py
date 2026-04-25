import tensorflow as tf
import os

def list_nodes_with_shapes(pb_path):
    if not os.path.exists(pb_path): return
    print(f"\n--- {os.path.basename(pb_path)} ---")
    
    with tf.io.gfile.GFile(pb_path, "rb") as f:
        graph_def = tf.compat.v1.GraphDef()
        graph_def.ParseFromString(f.read())
        
    with tf.Graph().as_default() as graph:
        tf.import_graph_def(graph_def, name="")
        
        for op in graph.get_operations():
            # Procurar por tensores que tenham 200 ou 50 na última dimensão
            for output in op.outputs:
                shape = output.shape
                if shape.ndims is not None:
                    s = list(shape)
                    if 200 in s or 50 in s or 400 in s:
                        print(f"Node: {output.name} | Shape: {s}")

models_dir = r"src/services/enricher/models"
list_nodes_with_shapes(os.path.join(models_dir, "msd-musicnn-1.pb"))
list_nodes_with_shapes(os.path.join(models_dir, "deam-msd-musicnn-2.pb"))
