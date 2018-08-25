<template>
  <div
    v-if="!empty"
    class="log">
    <div class="log-inner">
      <span
        v-for="(line, index) in lines"
        :key="index"
        :class="[line.type]"
        class="line">
        <span class="cell timestamp">{{ line.timestamp }}</span>
        <span class="cell icon">
          <i
            v-if="getTypeIcon(line.type)"
            :class="[getTypeIcon(line.type)]"
            class="fas"
            aria-hidden="true"/>
        </span>
        <span
          v-if="line.category"
          class="cell category">
          <span class="log-tag">{{ line.category }}</span>
        </span>
        <span class="cell content">{{ line.content }}</span>
      </span>
    </div>
  </div>
</template>

<script>
import { createNamespacedHelpers } from 'vuex';

const { mapState, mapGetters } = createNamespacedHelpers('log');

// TODO: Consider merging this with `TaskListItem`'s `stateIcons`
export const typeIcons = {
  error: 'fa-exclamation-circle',
  warning: 'fa-exclamation-triangle',
  success: 'fa-check-circle',
  info: 'fa-info-circle',
};

export default {
  name: 'Log',
  data() {
    return {
      lines: [],
    };
  },
  computed: {
    ...mapState({
      linesInStore: 'lines',
    }),
    ...mapGetters(['empty']),
  },
  mounted() {
    this.$watch('linesInStore', this.updateLines);
  },
  methods: {
    getTypeIcon: type => typeIcons[type],
    updateLines(value) {
      // Output log and keep scroll at bottom if already scrolled to bottom
      const el = this.$el;
      // FIXME: isScrolledToBottom is never true
      const isScrolledToBottom = el.scrollHeight - el.clientHeight <= el.scrollTop + 1;

      this.lines = value;

      if (isScrolledToBottom) {
        el.scrollTop = el.scrollHeight;
      }
    },
  },
};
</script>

<style lang="scss">
@import "styles/variables.scss";

/********************
        Logs
*********************/

@mixin logColoredLine($color, $backgroundColor, $borderColor, $iconColor) {
  color: $color;
  background-color: $backgroundColor;
  position: relative;

  .icon {
    color: $iconColor;
  }
}

.log {
  max-height: 300px;
  overflow-y: scroll;
  border: 1px solid #b7b7b7;
  border-radius: 3px;
  font-size: 11px;
  font-family: dejavu sans mono, monospace;

  .log-inner {
    border-collapse: collapse;

    .line {
      display: table-row;

      border-bottom: 1px solid rgb(240, 240, 240);

      &:last-child {
        border-bottom-width: 0;
      }

      &.success {
        @include logColoredLine(
          green,
          hsl(110, 100%, 98%),
          hsl(110, 97%, 88%),
          $successColor
        );
      }

      &.error {
        @include logColoredLine(
          red,
          hsl(0, 100%, 97%),
          hsl(50, 100%, 88%),
          $errorColor
        );
      }

      &.warning {
        @include logColoredLine(
          hsl(39, 100%, 18%),
          hsl(50, 100%, 95%),
          hsl(50, 100%, 80%),
          $warningColor
        );
      }

      &.info {
        @include logColoredLine(
          hsl(221, 100%, 18%),
          hsl(231, 100%, 98%),
          hsl(231, 100%, 88%),
          $infoColor
        );
      }

      & > .cell {
        display: table-cell;
        padding: 0.1em 0.3em;
      }

      .timestamp {
        white-space: nowrap;
        color: gray;
      }

      .icon {
        min-width: 1em;
        text-align: center;
      }

      .content {
        width: 100%;
      }
    }
  }
}
</style>
