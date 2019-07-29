<template>
  <div
    v-show="visible"
    class="progress-wrapper"
  >
    <span class="progress-label">
      <template v-if="!complete && !indeterminate">{{ progressText }}</template>
      <template v-if="complete">
        <b-icon
          :icon="icon"
          :type="type"
          size="is-small"
        />
      </template>
    </span>
    <div class="progress-bar-wrapper">
      <div
        :class="[
          type,
          size,
          {'complete': complete},
          {'indeterminate': indeterminate && !complete},
        ]"
        class="progress"
      >
        <div
          :aria-valuenow="value"
          :aria-valuemax="max"
          :style="{width: !indeterminate ? `${percentageValue}%` : ''}"
          class="progress-bar"
          role="progressbar"
        />
      </div>
    </div>
  </div>
</template>

<script>
import { stateIcons } from '@/components/tasks/TaskListItem.vue';
import { taskStates } from '@/store/modules/tasks';

// TODO: Make this less tightly linked to tasks
export default {
  name: 'BaseProgress',
  props: {
    state: {
      type: String,
      default: '',
    },
    size: {
      type: String,
      default: '',
    },
    indeterminate: {
      type: Boolean,
      default: false,
    },
    value: {
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
  data() {
    return {
      visible: true,
    };
  },
  computed: {
    percentageValue() {
      return (this.value / this.max) * 100;
    },
    percentageString() {
      return `${Math.round(this.percentageValue)}%`;
    },
    debug() {
      return this.$store.state.config.debug.progressBars;
    },
    progressText() {
      if (this.debug) {
        return `${this.value} / ${this.max} = ${this.percentageString}`;
      }
      return this.percentageString;
    },
    icon() {
      return stateIcons[this.state];
    },
    type() {
      if (this.state === taskStates.SUCCESS) {
        return 'is-success';
      } if (this.state === taskStates.WARNING) {
        return 'is-warning';
      } if (this.state === taskStates.ERROR) {
        return 'is-danger';
      }
      return 'is-info';
    },
  },
  watch: {
    complete(value) {
      this.completeStateChanged(value);
    },
  },
  created() {
    this.completeStateChanged(this.complete, true);
  },
  methods: {
    completeStateChanged(value, justCreated = false) {
      if (value) {
        if (this.hideOnComplete && !this.debug) {
          // If the progress element was just created and is already complete, hide it immediately.
          // We only have a delay so the user can see the progress bar move to the end.
          if (justCreated) {
            this.visible = false;
          } else {
            setTimeout(() => {
              if (this.complete) {
                this.visible = false;
              }
            }, 1000);
          }
        }
      } else {
        this.visible = true;
      }
    },
  },
};
</script>

<style lang="scss">
@import 'styles/variables.scss';
@import '~bulma/sass/elements/progress';

@keyframes moveIndeterminate {
  from {
    left: -50%;
  }
  to {
    left: 100%;
  }
}

.progress-wrapper {
  display: flex;
  align-items: center;

  .progress-bar-wrapper {
    width: 100%;
    margin-left: -40px;
    padding-left: 40px;
  }

  .progress,
  .progress:not(:last-child) {
    margin-bottom: 0;
  }

  .progress {
    display: flex;
    overflow: hidden;
    font-size: 0.75rem;
    background-color: $progress-bar-background-color;

    .progress-bar {
      width: 100%;
      display: flex;
      flex-direction: column;
      justify-content: center;
      color: #fff;
      text-align: center;
      white-space: nowrap;
      transition: width #{$progress-bar-transition-duration}s ease;
      background-color: $progress-value-background-color;
    }

    @each $name, $pair in $colors {
      $color: nth($pair, 1);
      &.is-#{$name} .progress-bar {
        background-color: $color;
      }
    }

    &.indeterminate {
      position: relative;
      .progress-bar {
        width: 30%;
        height: 100%;
        position: absolute;
        animation-duration: 1.5s;
        animation-iteration-count: infinite;
        animation-name: moveIndeterminate;
        animation-timing-function: linear;
      }
    }

    &.is-small {
      height: 0.6em;
    }
  }

  .progress-label {
    padding-right: 0.5em;
    font-size: 0.8em;
  }
}
</style>
