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
  <div
    v-else
    class="bordered-section"
  >
    <EmptyMessage message="Nothing has been logged yet" />
  </div>
</template>

<script lang="ts">
import ExportButtons from '@/components/ExportData/ExportButtons.vue';
import EmptyMessage from '@/components/EmptyMessage.vue';
import { writeCsv, writeJson, renderTable } from '@/backend/file_utils';
import { mapState, mapGetters } from 'vuex';
import { ExportFormatCode } from '@/backend/constants';
import { anonymizeClientsInOutput } from '@/backend/client_actions/utils';
import { LogType, LogLine } from '@/store/modules/log';

// TODO: Consider merging this with `TaskListItem`'s `stateIcons`
export const typeIcons = {
  success: 'fa-check-circle',
  error: 'fa-exclamation-circle',
  warning: 'fa-exclamation-triangle',
  info: 'fa-info-circle',
};

export const typeTooltips = {
  [LogType.SUCCESS]: 'Success',
  [LogType.ERROR]: 'Error',
  [LogType.WARNING]: 'Warning',
  [LogType.INFO]: 'Information',
};

const exportTypes: ExportFormatCode[] = [
  ExportFormatCode.TXT,
  ExportFormatCode.CSV,
  ExportFormatCode.JSON,
];

interface ComponentData {
  lines: LogLine[];
  /**
   * TODO: Document me better
   * Object map containing whether the log has changed since the corresponding export type
   * was queried.
   */
  logChanged: { [exportType: string]: boolean };
  /**
   * Cached log strings stored by export type.
   */
  cachedLog: { [exportType: string]: string };
}

export default {
  name: 'TheLog',
  components: {
    ExportButtons,
    EmptyMessage,
  },
  data(): ComponentData {
    return {
      lines: [],
      logChanged: {},
      cachedLog: {},
    };
  },
  computed: {
    ...mapState('log', {
      linesInStore: 'lines',
    }),
    ...mapGetters('log', ['empty']),
    ...mapState({
      clients: state => Object.values(state.clients.all),
    }),
    showDateInTimestamp() {
      return this.$store.state.config.log.showDateInTimestamp;
    },
    anonymizeClientsInExports() {
      return this.$store.state.config.debug.anonymizeClientsInExports;
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
      this.invalidateLogStringCache();
    },
    anonymizeClientsInExports() {
      this.invalidateLogStringCache();
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
     * @returns Icon name
     */
    getTypeIcon(type: LogType): string {
      return typeIcons[type];
    },
    /**
     * @returns Tooltip
     */
    getTypeTooltip(type: LogType): string {
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
      let output = null;
      if (type === ExportFormatCode.TXT) {
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
        output = renderTable(table);
      } else if (type === ExportFormatCode.CSV) {
        output = writeCsv(
          this.lines.map(line => ({
            timestamp: line.timestamp,
            type: line.type,
            category: line.category,
            content: line.content,
          })),
        );
      } else if (type === ExportFormatCode.JSON) {
        output = writeJson(this.lines);
      }
      if (this.anonymizeClientsInExports) {
        output = anonymizeClientsInOutput(output, this.clients);
      }
      return output;
    },
    async getCachedLogString(type) {
      if (this.logChanged[type]) {
        this.cachedLog[type] = this.getLogString(type);
        this.logChanged[type] = false;
      }
      return this.cachedLog[type];
    },
    invalidateLogStringCache() {
      for (const key of Object.keys(this.logChanged)) {
        this.logChanged[key] = true;
      }
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
