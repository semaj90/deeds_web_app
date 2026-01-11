/**
 * Makes an element draggable.
 *
 * @param element The element to make draggable.
 * @param onDragStart A callback function to be called when the drag starts.
 * @param onDragMove A callback function to be called when the drag moves.
 * @param onDragEnd A callback function to be called when the drag ends.
 */
export function draggable(
  element: HTMLElement,
  onDragStart?: (event: DragEvent) => void,
  onDragMove?: (event: DragEvent) => void,
  onDragEnd?: (event: DragEvent) => void
) {
  let isDragging = false;
  let offsetX = 0;
  let offsetY = 0;
  element.addEventListener('dragstart', (event) => {
    isDragging = true;
    offsetX = event.clientX - element.offsetLeft;
    offsetY = event.clientY - element.offsetTop;
    element.style.cursor = 'grabbing';
    if (onDragStart) {
      onDragStart(event);
    }
  });
  element.addEventListener('dragmove', (event) => {
    if (isDragging) {
      event.preventDefault();
      const x = event.clientX - offsetX;
      const y = event.clientY - offsetY;
      element.style.left = `${x}px`;
      element.style.top = `${y}px`;
      if (onDragMove) {
        onDragMove(event);
      }
    }
  });
  element.addEventListener('dragend', (event) => {
    isDragging = false;
    element.style.cursor = 'grab';
    if (onDragEnd) {
      onDragEnd(event);
    }
  });
  element.style.position = 'absolute';
  element.style.cursor = 'grab';
}

