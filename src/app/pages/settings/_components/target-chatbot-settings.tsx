import InputGroup from "@/components/FormElements/InputGroup";
import { ShowcaseSection } from "@/components/Layouts/showcase-section";

export function TargetChatbotSettingsForm() {
  return (
    <ShowcaseSection title="Target Chatbot Details" className="!p-7">
      <form>

        <InputGroup
          className="mb-5.5"
          type="text"
          name="api-url"
          label="API Url"
          placeholder="https://6ap5el4ga0.execute-api.eu-south-1.amazonaws.com/api/123"
          defaultValue="https://6ap5el4ga0.execute-api.eu-south-1.amazonaws.com/api/123"
          height="sm"
        />

        <InputGroup
          className="mb-5.5"
          type="text"
          name="api-param-name"
          label="Api Parameter Name"
          placeholder="X-Api-Key"
          defaultValue=""
          height="sm"
        />

        <InputGroup
          className="mb-5.5"
          type="text"
          name="api-key"
          label="Api Key"
          placeholder="6ap56ap5el4ga0el6ap5el4ga04ga0"
          defaultValue=""
          height="sm"
        />

        <div className="flex justify-end gap-3">
          <button
            className="rounded-lg border border-stroke px-6 py-[7px] font-medium text-dark hover:shadow-1 dark:border-dark-3 dark:text-white"
            type="button"
          >
            Cancel
          </button>

          <button
            className="rounded-lg bg-primary px-6 py-[7px] font-medium text-gray-2 hover:bg-opacity-90"
            type="submit"
          >
            Save
          </button>
        </div>
      </form>
    </ShowcaseSection>
  );
}
