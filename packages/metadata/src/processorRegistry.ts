import type { MetadataProcessor, MetadataProcessorRegistry } from "./interfaces.js";

/**
 * Registry mapping enrichment type capabilities to their corresponding MetadataProcessor.
 */
export class DefaultMetadataProcessorRegistry implements MetadataProcessorRegistry {
  private readonly processors = new Map<string, MetadataProcessor>();

  /**
   * Registers a metadata processor.
   */
  public register(processor: MetadataProcessor): void {
    this.processors.set(processor.enrichmentType, processor);
  }

  /**
   * Retrieves the processor registered for the given enrichment type.
   */
  public getProcessor(enrichmentType: string): MetadataProcessor | null {
    return this.processors.get(enrichmentType) || null;
  }
}
