<template>
  <div
    :class="[type, size, complete ? 'complete' : '', hideOnComplete ? 'hide-on-complete' : '']"
    class="progress">
    <div
      :aria-valuenow="value"
      :aria-valuemin="min"
      :aria-valuemax="max"
      :style="{width: `${percentageValue}%`}"
      class="progress-bar"
      role="progressbar">
      <span class="text">{{ percentageString }}</span>
    </div>
  </div>
</template>

<script>
export default {
  name: 'BaseProgress',
  props: {
    type: {
      type: String,
      default: '',
    },
    size: {
      type: String,
      default: '',
    },
    value: {
      type: Number,
      default: 0,
    },
    min: {
      type: Number,
      default: 0,
    },
    max: {
      type: Number,
      default: 1,
    },
    complete: {
      type: Boolean,
      default: false,
    },
    hideOnComplete: {
      type: Boolean,
      default: false,
    },
  },
  computed: {
    range() {
      return this.max - this.min;
    },
    percentageValue() {
      return ((this.value - this.min) / this.range) * 100;
    },
    percentageString() {
      return `${Math.round(this.percentageValue)}%`;
    },
  },
};
</script>

<style lang="scss">
@import 'styles/variables.scss';
@import 'styles/variable-overrides.scss';
@import '~bulma/sass/utilities/_all';
@import '~bulma/sass/elements/progress';

@mixin complete-animation($animation-name) {
  animation-name: $animation-name;
  animation-duration: #{$progress-bar-complete-animation-duration}s;
  animation-timing-function: ease;
  animation-fill-mode: forwards;
  animation-play-state: paused;
  animation-delay: #{$progress-bar-complete-animation-duration}s;
}

@keyframes collapse {
  100% {
    height: 0;
    margin-bottom: 0;
  }
}

@keyframes shrink {
  100% {
    transform: scale(0);
  }
}

.progress {
  display: flex;
  overflow: hidden;
  font-size: .75rem;
  background-color: $progress-bar-background-color;

  .progress-bar {
    display: -ms-flexbox;
    display: flex;
    flex-direction: column;
    justify-content: center;
    color: #fff;
    text-align: center;
    white-space: nowrap;
    transition: width #{$progress-bar-transition-duration}s ease;
    background-color: $progress-value-background-color;

    .text {
      padding-left: 0.5rem;
      padding-right: 0.5rem;
    }
  }

  @each $name, $pair in $colors {
    $color: nth($pair, 1);
    &.is-#{$name} .progress-bar {
      background-color: $color;
    }
  }

  &:not(:last-child) {
    margin-bottom: 0.5rem;
  }

  &.hide-on-complete {
    @include complete-animation(collapse);

    .progress-bar .text {
      transform: scale(1);
      @include complete-animation(shrink);
    }

    &.complete {
      animation-play-state: running;

      .progress-bar .text {
        animation-play-state: running;
      }
    }
  }
}
</style>
