<template>
  <div class="preview">
    <b-field label="Output preview format">
      <div
        v-if="formats.length < 8"
        class="control"
      >
        <b-radio
          v-for="format of formats"
          :key="format"
          v-model="selectedFormat"
          :native-value="format"
        >
          {{ getFormatName(format) }}
        </b-radio>
      </div>
      <b-select
        v-else
        v-model="selectedFormat"
      >
        <option
          v-for="format of formats"
          :key="format"
          :value="format"
        >
          {{ getFormatName(format) }}
        </option>
      </b-select>
    </b-field>
    <div
      v-if="output"
      class="control client-action-output-control"
    >
      <template v-if="outputGenerated">
        <ExportViewer
          :raw="displayRawOutput"
          :format="selectedFormat"
          :output="output"
        />
        <b-field>
          <b-checkbox
            v-if="selectedFormat !== ExportFormatCode.TXT"
            v-model="displayRawOutput"
          >
            Show raw output
          </b-checkbox>
        </b-field>
      </template>
      <div
        v-else-if="!outputGenerationErrorMessage"
        class="bordered-section"
      >
        <LoadingMessage message="Generating output preview" />
      </div>
      <b-message
        v-if="outputGenerationErrorMessage"
        type="is-danger"
        title="Error generating output"
      >
        {{ outputGenerationErrorMessage }}
      </b-message>
    </div>
    <div
      v-else
      class="bordered-section"
    >
      <EmptyMessage message="Output is empty" />
    </div>
  </div>
</template>

<script lang="ts">
import EmptyMessage from '@/components/EmptyMessage.vue';
import LoadingMessage from '@/components/LoadingMessage.vue';
import { ExportFormatCode } from '@/backend/constants';
import ExportViewer from '@/components/ExportData/ExportViewer.vue';
import { errorToString } from '@/backend/errors';
import ExportGeneratorsMixin from '@/components/ExportData/export_generators_mixin';

export default {
  name: 'ClientActionOutputPreview',
  components: {
    EmptyMessage,
    LoadingMessage,
    ExportViewer,
  },
  mixins: [ExportGeneratorsMixin],
  props: {
    /** Actual output value. This is only needed to detect when we need to generate a new output. */
    outputValue: {
      type: Object,
      required: true,
    },
  },
  data() {
    return {
      output: null,
      outputGenerated: false,
      ExportFormatCode,
      displayRawOutput: false,
      outputGenerationError: null,
    };
  },
  computed: {
    outputGenerationErrorMessage() {
      if (this.outputGenerationError) {
        return errorToString(this.outputGenerationError);
      }
      return null;
    },
  },
  watch: {
    selectedFormat() {
      this.outputGenerated = false;
      this.getOutput();
    },
    outputValue() {
      this.getOutput();
    },
  },
  created() {
    this.getOutput();
  },
  methods: {
    async getOutput() {
      try {
        this.outputGenerated = false;
        this.output = await this.generator(this.selectedFormat);
        this.outputGenerated = true;
        this.outputGenerationError = false;
      } catch (error) {
        this.outputGenerationError = error;
      }
    },
  },
};
</script>
