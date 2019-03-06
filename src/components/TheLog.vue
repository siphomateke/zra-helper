<template>
  <div v-if="!empty">
    <div
      ref="scrollRegion"
      class="log"
    >
      <div class="log-inner">
        <span
          v-for="(line, index) in lines"
          :key="index"
          :class="[line.type]"
          class="line"
        >
          <span
            class="cell timestamp"
          >{{ showDateInTimestamp ? line.timestamp : line.timestampNoDate }}</span>
          <span class="cell icon">
            <i
              v-if="getTypeIcon(line.type)"
              :class="[getTypeIcon(line.type)]"
              :title="getTypeTooltip(line.type)"
              class="fas"
              aria-hidden="true"
            />
          </span>
          <span
            v-if="line.category"
            class="cell category"
          >
            <span class="log-tag">{{ line.category }}</span>
          </span>
          <span class="cell content">{{ line.content }}</span>
        </span>
      </div>
    </div>
    <ExportButtons
      :generators="exportGenerators"
      :disabled="lines.length === 0"
      filename="log"
    />
  </div>
  <EmptySection
    v-else
    message="Nothing has been logged yet"
  />
</template>

<script>
import ExportButtons from '@/components/ExportData/ExportButtons.vue';
import EmptySection from '@/components/EmptySection.vue';
import { writeCsv, writeJson } from '@/backend/file_utils';
import { createNamespacedHelpers } from 'vuex';
import renderTable from 'text-table';
import { exportFormatCodes } from '@/backend/constants';

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

/** @type {import('@/backend/constants').ExportFormatCode[]} */
const exportTypes = [exportFormatCodes.TXT, exportFormatCodes.CSV, exportFormatCodes.JSON];

export default {
  name: 'TheLog',
  components: {
    ExportButtons,
    EmptySection,
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
    exportGenerators() {
      const generators = {};
      for (const type of exportTypes) {
        generators[type] = () => this.getCachedLogString(type);
      }
      return generators;
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
      const el = this.$refs.scrollRegion;
      const isScrolledToBottom = el.scrollHeight - el.clientHeight <= el.scrollTop + 1;

      // copy value to lines by value
      this.lines = [];
      for (let i = 0; i < value.length; i++) {
        this.lines[i] = value[i];
      }

      // Wait until the new lines have been added before we scroll to the bottom
      this.$nextTick().then(() => {
        if (isScrolledToBottom) {
          el.scrollTop = el.scrollHeight;
        }
      });
    },
    getLogString(type) {
      if (type === exportFormatCodes.TXT) {
        const table = this.lines.map((line) => {
          const row = [];
          row.push(line.timestamp);
          let lineTypeString = '';
          if (line.type) {
            lineTypeString = this.getTypeTooltip(line.type);
          }
          row.push(lineTypeString);
          row.push(line.category);
          row.push(line.content);
          return row;
        });
        return renderTable(table);
      } else if (type === exportFormatCodes.CSV) {
        return writeCsv(this.lines.map(line => ({
          timestamp: line.timestamp,
          type: line.type,
          category: line.category,
          content: line.content,
        })));
      } else if (type === exportFormatCodes.JSON) {
        return writeJson(this.lines);
      }
      return null;
    },
    async getCachedLogString(type) {
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
@import 'styles/variables.scss';

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
  border: 1px solid $region-outline-color;
  border-radius: 3px;
  font-size: 11px;
  font-family: dejavu sans mono, monospace;
  margin-bottom: $export-buttons-margin;

  .log-inner {
    border-collapse: collapse;

    .line {
      display: table-row;

      border-bottom: 1px solid rgb(240, 240, 240);

      &:last-child {
        border-bottom-width: 0;
      }

      &.success {
        @include logColoredLine(green, hsl(110, 100%, 98%), hsl(110, 97%, 88%), $successColor);
      }

      &.error {
        @include logColoredLine(red, hsl(0, 100%, 97%), hsl(50, 100%, 88%), $errorColor);
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
