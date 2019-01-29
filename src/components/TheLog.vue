<template>
  <div v-if="!empty">
    <div class="log">
      <div class="log-inner">
        <span
          v-for="(line, index) in lines"
          :key="index"
          :class="[line.type]"
          class="line">
          <span class="cell timestamp">
            {{ showDateInTimestamp ? line.timestamp : line.timestampNoDate }}
          </span>
          <span class="cell icon">
            <i
              v-if="getTypeIcon(line.type)"
              :class="[getTypeIcon(line.type)]"
              :title="getTypeTooltip(line.type)"
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
    <ExportButtons
      :raw="() => getCachedLogString('raw')"
      :csv="() => getCachedLogString('csv')"
      :json="() => getCachedLogString('json')"
      :disabled="lines.length === 0"
      filename="log"/>
  </div>
</template>

<script>
import ExportButtons from '@/components/ExportData/ExportButtons.vue';
import { writeCsv, writeJson } from '@/backend/file_utils';
import { createNamespacedHelpers } from 'vuex';

const { mapState, mapGetters } = createNamespacedHelpers('log');

/**
 * @typedef {import('@/store/modules/log').LogType} LogType
 */

// TODO: Consider merging this with `TaskListItem`'s `stateIcons`
export const typeIcons = {
  success: 'fa-check-circle',
  error: 'fa-exclamation-circle',
  warning: 'fa-exclamation-triangle',
  info: 'fa-info-circle',
};

export const typeTooltips = {
  success: 'Success',
  error: 'Error',
  warning: 'Warning',
  info: 'Information',
};

/**
 * @typedef {string} ExportType
 */

/** @type {ExportType[]} */
const exportTypes = ['raw', 'csv', 'json'];

export default {
  name: 'TheLog',
  components: {
    ExportButtons,
  },
  data() {
    return {
      lines: [],
      /**
       * TODO: Document me better
       * Object map containing whether the log has changed since the corresponding export type was queried.
       * @type {Object.<ExportType, Boolean>}
       */
      logChanged: {},
      /**
       * Cached log strings stored by export type.
       * @type {Object.<ExportType, String>}
       */
      cachedLog: {},
    };
  },
  computed: {
    ...mapState({
      linesInStore: 'lines',
    }),
    ...mapGetters(['empty']),
    showDateInTimestamp() {
      return this.$store.state.config.log.showDateInTimestamp;
    },
  },
  watch: {
    lines() {
      for (const key of Object.keys(this.logChanged)) {
        this.logChanged[key] = true;
      }
    },
  },
  created() {
    for (const exportType of exportTypes) {
      this.logChanged[exportType] = false;
      this.cachedLog[exportType] = '';
    }
  },
  mounted() {
    this.$watch('linesInStore', this.updateLines);
  },
  methods: {
    /**
     * @param {LogType} type
     * @returns {string} Icon name
     */
    getTypeIcon(type) {
      return typeIcons[type];
    },
    /**
     * @param {LogType} type
     * @returns {string} Tooltip
     */
    getTypeTooltip(type) {
      return typeTooltips[type];
    },
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
    getLogString(type) {
      if (type === 'raw') {
        const longest = {
          type: 0,
          category: 0,
        };
        for (const line of this.lines) {
          if (line.type && line.type.length > longest.type) {
            longest.type = line.type.length;
          }
          if (line.category && line.category.length > longest.category) {
            longest.category = line.category.length;
          }
        }

        return this.lines.map((line) => {
          let lineString = `${line.timestamp} `;
          let lineTypeString = '';
          if (line.type) {
            lineTypeString = this.getTypeTooltip(line.type);
          }
          lineString += `${lineTypeString.padEnd(longest.type)} `;
          lineString += `${line.category.padEnd(longest.category)} `;
          lineString += line.content;
          return lineString;
        }).join('\n');
      } else if (type === 'csv') {
        return writeCsv(this.lines.map(line => ({
          timestamp: line.timestamp,
          type: line.type,
          category: line.category,
          content: line.content,
        })));
      } else if (type === 'json') {
        return writeJson(this.lines);
      }
      return null;
    },
    getCachedLogString(type) {
      if (this.logChanged[type]) {
        this.cachedLog[type] = this.getLogString(type);
        this.logChanged[type] = false;
      }
      return this.cachedLog[type];
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
  margin-bottom: 1em;

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
