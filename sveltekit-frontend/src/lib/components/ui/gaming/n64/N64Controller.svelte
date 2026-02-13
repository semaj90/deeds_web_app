<!--
  N64 Controller Visual
-->
<script lang="ts">
  interface Props {
    class?: string;
  }

  let { class: className = '' }: Props = $props();
</script>

<div class="n64-controller-stub {className}">
  <div class="controller-shape">
    <div class="handle left"></div>
    <div class="handle middle"></div>
    <div class="handle right"></div>
    <div class="c-buttons"></div>
    <div class="a-button">A</div>
    <div class="b-button">B</div>
  </div>
</div>

<style>
  .n64-controller-stub {
      width: 100px;
      height: 80px;
      position: relative;
  }
  .controller-shape {
      width: 100%;
      height: 60%;
      background: #888;
      border-radius: 10px 10px 40px 40px;
      position: relative;
  }
  .handle {
      position: absolute;
      bottom: -30px;
      width: 20px;
      height: 50px;
      background: #888;
      border-radius: 0 0 10px 10px;
  }
  .handle.left { left: 10px; transform: rotate(10deg); }
  .handle.middle { left: 40px; }
  .handle.right { right: 10px; transform: rotate(-10deg); }

  .a-button, .b-button {
      position: absolute;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 8px;
      color: white;
      font-weight: bold;
  }
  .a-button { background: blue; right: 15px; top: 25px; }
  .b-button { background: green; right: 30px; top: 30px; }
</style>
