A* algo

```py
def a_star(self, src: Node, dst: Node):
    # Keep track of nodes and costs to reach them
    g_score = {n_id: math.inf for n_id in self.nodes}
    g_score[src.id] = 0
    
    # Nodes and costs (with heuristic included)
    f_score = {n_id: math.inf for n_id in self.nodes}
    f_score[src.id] = g_score[src.id] + self.__heuristic(src, dst)

    pq = PriorityQueue()
    pq.put((f_score[src.id], src.id))

    while not pq.empty():
        (cur_f_score, node_id) = pq.get()

        # Early exit in case the destination is reached.
        if node_id == dst.id:
            break

        # Check neighbor nodes to current node.
        for neighbor_id in self.nodes[node_id].neighbors:
            tentative_g_score = g_score[node_id] + self.edges[self.adjacency[(node_id, neighbor_id)]].length

            if tentative_g_score < g_score[neighbor_id]:
                g_score[neighbor_id] = tentative_g_score
                f_score[neighbor_id] = g_score[neighbor_id] + self.__heuristic(self.nodes.get(neighbor_id), dst)

                pq.put((f_score[neighbor_id], neighbor_id))

...
# Heuristic function to guide A* Search.
def __heuristic(self, u: Node, v: Node) -> float:
    return haversine((u.geometry.y, u.geometry.x), (v.geometry.y, v.geometry.x), unit='m')
```