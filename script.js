class Slot {
  /**
   * The Father.
   * @type {Component}
   */
  owner;

  value = false;

  _cachedIndex;

  constructor(owner) {
    this.owner = owner;
  }

  getIndex(list) {
    // Store the result since it shouldn't change anyway
    if (!this._cachedIndex) {
      this._cachedIndex = this.owner[list].indexOf(this);
    }
    return this._cachedIndex;
  }
}

class InputSlot extends Slot {
  /**
   * @type {Connection}
   */
  connection;

  constructor(owner) {
    super(owner);
  }

  getIndex() {
    return super.getIndex("inputs");
  }

  toggle() {
    this.setValue(!this.value);
  }

  setValue(state) {
    this.value = state;
    this.owner.updateAndPropagate();
  }
}

class OutputSlot extends Slot {
  /**
   * Output connections
   * @type {Connection[]}
   */
  connections = [];

  constructor(owner) {
    super(owner);
  }

  getIndex() {
    return super.getIndex("outputs");
  }

  propagate() {
    for (let i = 0; i < this.connections.length; i++) {
      this.connections[i].propagate();
    }
  }

  // Makes a new mutual connection between the slots
  connectTo(targetInput, linePoints) {
    if (targetInput.connection) targetInput.connection.disconnect();
    this.connections.push((targetInput.connection = new Connection(this, targetInput, linePoints)));
  }
}

class Connection {
  /**
   * Source output
   * @type {OutputSlot}
   */
  sourceOutput;

  /**
   * Destination input
   * @type {InputSlot}
   */
  destInput;

  /**
   * Line turn points
   * @type {[x: Number, y: Number][]}
   */
  linePoints = [];

  constructor(source, dest, linePoints) {
    this.sourceOutput = source;
    this.destInput = dest;

    this.linePoints = linePoints ?? [];

    this.propagate();
  }

  disconnect() {
    this.sourceOutput.connections.splice(this.sourceOutput.connections.indexOf(this), 1);
    this.destInput.connection = null;
    this.destInput.value = false;
  }

  propagate() {
    const oldValue = this.destInput.value;
    if (this.sourceOutput.value !== oldValue) {
      this.destInput.value = this.sourceOutput.value;
      this.destInput.owner.updateAndPropagate();
    }
  }
}

class Component {
  type = "generic";

  sizing = 32;

  label = "";
  x = 0;
  y = 0;

  get width() {
    // this is meth not math
    return Math.min(Math.max(80, Math.ceil((this.label.length * 16 + 24) / 16) * 16), 192);
  }

  get height() {
    return Math.max(this.inputs.length * this.sizing, this.outputs.length * this.sizing, this.sizing);
  }

  /**
   * Input slots
   * @type {InputSlot[]}
   */
  inputs = [];

  /**
   * Output slots
   * @type {OutputSlot[]}
   */
  outputs = [];

  constructor(name, evaluateFunc, numInputs = 2, numOutputs = 1) {
    this.type = name;
    this.label = name;
    this.inputs = Array.from({ length: numInputs }, () => new InputSlot(this));
    this.outputs = Array.from({ length: numOutputs }, () => new OutputSlot(this));
    this.evaluate = evaluateFunc;
    this.update();
  }

  // Returns a duplicate of self
  clone() {
    const clone = new Component(this.label, this.evaluate, this.inputs.length, this.outputs.length);
    clone.x = this.x + this.width;
    clone.y = this.y + this.height;
    return clone;
  }

  /**
   * Returns output value(s) based on some criteria on the inputs.
   * To be implemented by instances and extending classes.
   *
   * @param {Boolean[]} inputs
   * @returns {Boolean[]}
   */
  evaluate(inputs) {}

  update() {
    const result = this.evaluate(this.inputs.map((i) => i.value)) ?? [];
    for (let i = 0; i < Math.min(this.outputs.length, result.length); i++) {
      this.outputs[i].value = result[i];
    }
  }

  propagateOutputs() {
    for (let i = 0; i < this.outputs.length; i++) this.outputs[i].propagate();
  }

  updateAndPropagate() {
    this.update();
    this.propagateOutputs();
  }

  getInputIndexAtY(y) {
    return Math.round((y - this.height / this.inputs.length / 2) / (this.height / this.inputs.length));
  }

  getInputAtY(y) {
    return this.inputs[this.getInputIndexAtY(y)];
  }

  getOutputIndexAtY(y) {
    return Math.round((y - this.height / this.outputs.length / 2) / (this.height / this.outputs.length));
  }

  getOutputAtY(y) {
    return this.outputs[this.getOutputIndexAtY(y)];
  }

  getInputPosition(n) {
    return [this.x, this.y + ((this.height / this.inputs.length) * n + this.height / this.inputs.length / 2)];
  }

  getOutputPosition(n) {
    return [this.x + this.width, this.y + ((this.height / this.outputs.length) * n + this.height / this.outputs.length / 2)];
  }

  dismember() {
    for (let ii = 0; ii < this.inputs.length; ii++) {
      this.inputs[ii].connection?.disconnect();
    }
    for (let oi = 0; oi < this.outputs.length; oi++) {
      for (let ci = this.outputs[oi].connections.length; ci >= 0; ci--) {
        this.outputs[oi].connections[ci]?.disconnect();
      }
    }
  }

  /**
   *
   * @param {CanvasRenderingContext2D} ctx the canvas context to use
   */
  draw(ctx) {
    ctx.font = this.sizing + "px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.beginPath();
    ctx.fillStyle = theme.componentFace;
    ctx.roundRect(this.x, this.y, this.width, this.height, 8);
    ctx.fill();

    ctx.fillStyle = theme.componentText;
    ctx.fillText(this.label, this.x + this.width / 2, this.y + this.height / 2, this.width);

    // Drawing inputs
    for (let i = 0; i < this.inputs.length; i++) {
      ctx.beginPath();
      ctx.arc(...this.getInputPosition(i), 8, 0, Math.PI * 2);
      ctx.fillStyle = this.inputs[i].value ? theme.valueOn : theme.valueOff;
      ctx.fill();
    }

    // Drawing outputs
    for (let oi = 0; oi < this.outputs.length; oi++) {
      const output = this.outputs[oi];
      ctx.beginPath();
      const position = this.getOutputPosition(oi);
      ctx.arc(...position, 8, 0, Math.PI * 2);
      ctx.fillStyle = output.value ? theme.valueOn : theme.valueOff;
      ctx.fill();

      // Drawing connections
      for (let ci = 0; ci < output.connections.length; ci++) {
        const connection = output.connections[ci];

        ctx.beginPath();
        ctx.moveTo(...position);

        for (let i = 0; i < connection.linePoints.length; i++) {
          ctx.lineTo(...connection.linePoints[i]);
        }
        ctx.lineTo(...connection.destInput.owner.getInputPosition(connection.destInput.getIndex()));

        ctx.lineCap = "round";
        ctx.lineWidth = 10;
        ctx.lineJoin = "round";
        ctx.strokeStyle = ctx.fillStyle;
        ctx.stroke();
      }
    }
  }

  /**
   * Renders an image of the component
   * @param {Number} resolution the maximum image dimension length
   * @returns {String} data url of the image
   */
  getSelfPortrait(resolution = 256) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    const ratio = (this.width + 16) / this.height;

    canvas.width = Math.min(resolution, resolution * ratio);
    canvas.height = Math.min(resolution / ratio, resolution);

    ctx.scale(canvas.width / (this.width + 16), canvas.height / this.height);
    ctx.translate(8, 0);

    this.draw(ctx);

    const image = canvas.toDataURL();

    canvas.remove();

    return image;
  }
}

class CustomComponent extends Component {
  constructor(name, circuit) {
    super(name);
    this.type = "custom";
    this.circuit = circuit;
  }

  evaluate(inputs) {}
}

const defaultComponents = {
  is: new Component("is", (inputs) => [inputs[0]], 1),
  and: new Component("and", (inputs) => [inputs.every((b) => b === true)]),
  or: new Component("or", (inputs) => [inputs.some((b) => b === true)]),
  xor: new Component("xor", (inputs) => [inputs.indexOf(true) === inputs.lastIndexOf(true) && inputs.indexOf(true) !== -1]),
  not: new Component("not", (inputs) => [!inputs[0]], 1),
  nand: new Component("nand", (inputs) => [inputs.some((b) => b === false)]),
  nor: new Component("nor", (inputs) => [inputs.every((b) => b === false)]),
  xnor: new Component("xnor", (inputs) => [!(inputs.indexOf(true) === inputs.lastIndexOf(true) && inputs.indexOf(true) !== -1)]),
};

class Workspace {
  inputs = [];

  outputs = [];

  /**
   * All components in the workspace
   * @type {Component[]}
   */
  components = [];

  zoom = 1;
  panX = 0;
  panY = 0;

  gridSize = 16;

  isPanning = false;

  /**
   * The component currently being dragged
   * @type {Component}
   */
  dragging = null;

  /**
   * The output currently being dragged and connected
   * @type {OutputSlot}
   */
  connectingOutputSlot = null;

  connectionPoints = [];

  /**
   * Canvas rendering context
   * @type {CanvasRenderingContext2D}
   */
  ctx;

  _pointerX = 0;
  _pointerY = 0;

  constructor(canvas) {
    this.ctx = canvas.getContext("2d");
    // this.resizeCanvas();
    this.addEventListeners();

    this.zoom = devicePixelRatio;
  }

  addComponent(component) {
    component.id = this.components.push(component);
  }

  removeComponent(component) {
    component.dismember();
    this.components.splice(this.components.indexOf(component), 1);
  }

  worldToScreen(x, y) {
    return [this.ctx.canvas.width / 2 + this.panX * this.zoom + x * this.zoom, this.ctx.canvas.height / 2 + this.panY * this.zoom + y * this.zoom];
  }

  screenToWorld(x, y) {
    return [(x - this.ctx.canvas.width / 2 - this.panX * this.zoom) / this.zoom, (y - this.ctx.canvas.height / 2 - this.panY * this.zoom) / this.zoom];
  }

  getComponentAt(x, y) {
    const slotMargin = 8;
    for (let i = this.components.length - 1; i >= 0; i--) {
      const c = this.components[i];

      const inputMargin = 8 * (c.inputs.length > 0);
      const outputMargin = 8 * (c.outputs.length > 0);

      if (x >= c.x - inputMargin && x <= c.x + c.width + outputMargin && y >= c.y && y <= c.y + c.height) {
        return c;
      }
    }
  }

  addEventListeners() {
    const updateGrid = () => {
      this.ctx.canvas.style.backgroundSize = `${this.gridSize * this.zoom}px ${this.gridSize * this.zoom}px`;
      // this.ctx.canvas.style.backgroundPosition = `${this.ctx.canvas.width / 2 + this.panX * this.zoom}px ${this.ctx.canvas.height / 2 + this.panY * this.zoom}px`;
      this.ctx.canvas.style.backgroundPosition = `${this.ctx.canvas.width / 2 + (this.panX + this.gridSize / 2) * this.zoom}px
                                                  ${this.ctx.canvas.height / 2 + (this.panY + this.gridSize / 2) * this.zoom}px`;
    };

    const resizeCanvas = () => {
      const rect = this.ctx.canvas.getBoundingClientRect();
      this.ctx.canvas.width = rect.width * devicePixelRatio;
      this.ctx.canvas.height = rect.height * devicePixelRatio;
      updateGrid();
    };

    resizeCanvas();

    updateGrid();

    window.addEventListener("resize", resizeCanvas.bind(this));

    this.ctx.canvas.addEventListener(
      "wheel",
      (e) => {
        this.zoom += ((-e.deltaY / 100) * this.zoom) / 5;
        this.zoom = Math.min(5, Math.max(0.2, this.zoom));
        updateGrid();
      },
      { passive: true }
    );

    this.ctx.canvas.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;

      let [x, y] = this.screenToWorld(e.offsetX, e.offsetY);
      const target = this.getComponentAt(x, y);

      if (target) {
        const relativeX = x - target.x;
        const relativeY = y - target.y;

        if (relativeX < 12) {
          const targetInput = target.getInputAtY(relativeY);
          if (targetInput.connection) {
            targetInput.connection.disconnect();
          } else {
            targetInput.toggle();
          }
        } else if (relativeX > target.width - 12) {
          this.connectingOutputSlot = target.getOutputAtY(relativeY);
        } else {
          this.dragging = target;
        }
      } else {
        this.isPanning = true;
      }
    });

    let lastX = 0;
    let lastY = 0;
    document.addEventListener("pointermove", (e) => {
      const point = this.screenToWorld(e.clientX, e.clientY);
      [this._pointerX, this._pointerY] = point; // Store the current cursor position for use in draw()
      const [deltaX, deltaY] = [e.clientX - lastX, e.clientY - lastY];

      if (this.connectingOutputSlot) {
        const origin = this.connectingOutputSlot.owner.getOutputPosition(this.connectingOutputSlot.getIndex());
        const last = this.connectionPoints[this.connectionPoints.length - 1] ?? origin;

        const axis = this.connectionPoints.length % 2 ? 1 : 0;
        const comp = this.connectionPoints.length % 2 ? 0 : 1; // Complementary - perpendicular axis

        // Add a point when the cursor takes a 90-degree turn
        if (Math.abs(point[comp] - last[comp]) >= this.gridSize * 0.75) {
          const newPoint = new Array(2);
          newPoint[axis] = Math.round(point[axis] / this.gridSize) * this.gridSize;
          newPoint[comp] = last[comp];
          if (last[axis] === newPoint[axis] && this.connectionPoints.length > 0) {
            this.connectionPoints.pop(); // Remove the last point if the cursor backtracks to it again
          } else {
            this.connectionPoints.push(newPoint); // If not, add a new point there
          }
        }
      } else if (this.dragging) {
        this.dragging.x += deltaX / this.zoom;
        this.dragging.y += deltaY / this.zoom;
      } else if (this.isPanning) {
        this.panX += deltaX / this.zoom;
        this.panY += deltaY / this.zoom;
        updateGrid();
      }

      [lastX, lastY] = [e.clientX, e.clientY];
    });

    document.addEventListener("pointerup", (e) => {
      if (this.dragging) {
        this.dragging.x = Math.round(this.dragging.x / this.gridSize) * this.gridSize;
        this.dragging.y = Math.round(this.dragging.y / this.gridSize) * this.gridSize;
      } else if (this.connectingOutputSlot) {
        let [x, y] = this.screenToWorld(e.offsetX, e.offsetY);

        const target = this.getComponentAt(x, y);
        if (target && target !== this.connectingOutputSlot.owner) {
          const relativeY = y - target.y;
          const targetInput = target.getInputAtY(relativeY);

          if (targetInput) {
            this.connectingOutputSlot.connectTo(targetInput, this.connectionPoints);
          }
        }
      }

      this.connectingOutputSlot = null;
      this.connectionPoints = [];
      this.isPanning = false;
      this.dragging = null;
    });

    this.ctx.canvas.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const targetComponent = this.getComponentAt(...this.screenToWorld(e.clientX, e.clientY));
      if (targetComponent) {
        const menu = [
          {
            text: "Duplicate",
            action: () => this.components.push(targetComponent.clone()),
          },
          {
            text: "Disconnect",
            action: () => targetComponent.dismember(),
          },
          {
            text: "Remove",
            action: () => this.removeComponent(targetComponent),
          },
        ];
        contextMenu(menu, e.clientX, e.clientY);
      } else {
        const menu = [
          {
            text: "Save",
            hint: "ctrl + s",
            action: () => {},
          },
          {
            text: "Convert to Component",
            action: () => {},
            disabled: true,
          },
          {
            divider: true,
          },
          {
            text: "Toggle Grid",
            action: () => this.ctx.canvas.classList.toggle("grid"),
          },
        ];

        contextMenu(menu, e.clientX, e.clientY);
      }
    });
  }

  draw(timestamp) {
    this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);

    if (false) {
      this.ctx.strokeStyle = theme.grid;
      this.ctx.lineWidth = 1;

      for (let x = (this.ctx.canvas.width / 2 + this.panX * this.zoom) % (this.gridSize * this.zoom); x < this.ctx.canvas.width; x += this.gridSize * this.zoom) {
        this.ctx.beginPath();
        this.ctx.moveTo(x, 0);
        this.ctx.lineTo(x, this.ctx.canvas.height);
        this.ctx.stroke();
      }

      for (let y = (this.ctx.canvas.height / 2 + this.panY * this.zoom) % (this.gridSize * this.zoom); y < this.ctx.canvas.height; y += this.gridSize * this.zoom) {
        this.ctx.beginPath();
        this.ctx.moveTo(0, y);
        this.ctx.lineTo(this.ctx.canvas.width, y);
        this.ctx.stroke();
      }
    }

    this.ctx.save();
    this.ctx.translate(this.ctx.canvas.width / 2 + this.panX * this.zoom, this.ctx.canvas.height / 2 + this.panY * this.zoom);
    this.ctx.scale(this.zoom, this.zoom);

    for (const component of this.components) {
      component.draw(this.ctx);
    }

    if (this.connectingOutputSlot) {
      this.ctx.beginPath();
      this.ctx.moveTo(...this.connectingOutputSlot.owner.getOutputPosition(this.connectingOutputSlot.getIndex()));

      for (let i = 0; i < this.connectionPoints.length; i++) {
        const point = this.connectionPoints[i];
        this.ctx.lineTo(...point);
      }

      const prev = this.connectionPoints[this.connectionPoints.length - 1] ?? this.connectingOutputSlot.owner.getOutputPosition(this.connectingOutputSlot.getIndex());

      this.ctx.lineTo(...(this.connectionPoints.length % 2 ? [prev[0], this._pointerY] : [this._pointerX, prev[1]]));

      this.ctx.lineCap = "round";
      this.ctx.lineWidth = 10;
      this.ctx.lineJoin = "round";
      this.ctx.strokeStyle = this.connectingOutputSlot.value ? theme.valueOn : theme.valueOff;
      this.ctx.stroke();
    }

    this.ctx.restore();

    requestAnimationFrame(this.draw.bind(this));
  }
}

var theme = {
  componentFace: "#46d",
  componentText: "#fff",
  valueOff: "#f00",
  valueOn: "#0f0",
  grid: "#6663",
};

function contextMenu(menu, x, y) {
  document.querySelector(".context-menu")?.remove();
  const list = document.createElement("ul");
  list.className = "context-menu";
  list.oncontextmenu = (e) => e.preventDefault();

  for (let i = 0; i < menu.length; i++) {
    const item = menu[i];

    if (item.divider) {
      list.appendChild(document.createElement("hr"));
      continue;
    }

    const li = document.createElement("li");
    li.textContent = item.text;

    if (item.hint) {
      const hint = document.createElement("small");
      hint.textContent = item.hint;
      li.appendChild(hint);
    }

    if (item.disabled) {
      li.classList.add("disabled");
      li.inert = true;
    }

    li.addEventListener("pointerup", () => {
      item.action();
      if (!item.persist) {
        list.remove();
      }
    });

    list.appendChild(li);
  }

  document.addEventListener(
    "pointerdown",
    (e) => {
      if (e.target.parentElement !== list && e.target !== list) {
        list.remove();
      }
    },
    { once: true }
  );

  list.style.left = x + "px";
  list.style.top = y + "px";

  document.body.appendChild(list);

  const rect = list.getBoundingClientRect();

  let finalX = x;
  let finalY = y;

  if (rect.right > innerWidth) {
    finalX = x - rect.width;
  }
  if (finalX < 0) {
    finalX = 0;
  }

  if (rect.bottom > innerHeight) {
    finalY = y - rect.height;
  }
  if (finalY < 0) {
    finalY = 0;
  }

  list.style.left = finalX + "px";
  list.style.top = finalY + "px";

  // Start animation from the start position regardless of the final menu position
  list.style.transformOrigin = ((x - list.offsetLeft) / rect.width) * 100 + "% " + ((y - list.offsetTop) / rect.height) * 100 + "%";

  list.classList.add("appear");
}

const canvas = document.getElementById("mainCanvas");
const workspace = new Workspace(canvas);
const palette = document.querySelector(".palette");

window.addEventListener("load", () => {
  let isGrabbing = false;

  palette.addEventListener("pointerup", function () {
    if (workspace.dragging) {
      workspace.removeComponent(workspace.dragging);
      workspace.dragging = undefined;
      this.classList.remove("danger");
    }
  });

  palette.addEventListener("pointerenter", function () {
    if (workspace.dragging) {
      this.classList.add("danger");
    }
  });

  palette.addEventListener("pointerleave", function () {
    if (workspace.dragging) {
      this.classList.remove("danger");
    }
  });

  document.addEventListener("pointerup", () => {
    isGrabbing = false;
  });

  for (const key in defaultComponents) {
    const component = defaultComponents[key];
    const newItem = document.createElement("img");
    newItem.draggable = false;
    newItem.classList.add("palette-item");
    newItem.alt = newItem.title = component.label;

    newItem.src = component.getSelfPortrait();

    newItem.addEventListener("pointerdown", (e) => {
      isGrabbing = true;
    });

    newItem.addEventListener("pointerleave", (e) => {
      if (isGrabbing) {
        isGrabbing = false;
        const c = component.clone();
        workspace.components.push(c);
        [c.x, c.y] = workspace.screenToWorld(e.clientX - (c.width / 2) * workspace.zoom, e.clientY - (c.height / 2) * workspace.zoom);
        workspace.dragging = c;
      }
    });

    newItem.addEventListener("click", () => {
      c = component.clone();
      const position = workspace.screenToWorld((Math.random() * 0.6 + 0.3) * canvas.width, (Math.random() * 0.8 + 0.1) * canvas.height);
      [c.x, c.y] = [Math.round(position[0] / workspace.gridSize) * workspace.gridSize, Math.round(position[1] / workspace.gridSize) * workspace.gridSize];
      workspace.components.push(c);
    });

    newItem.addEventListener("contextmenu", (e) => {
      e.preventDefault();
    });

    palette.appendChild(newItem);
  }
});

workspace.draw();
