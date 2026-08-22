import { z } from "zod";
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES } from "@/lib/constants";

export const uploadRequestSchema = z.object({
  filename: z.string().min(1).max(180),
  contentType: z.enum(ALLOWED_UPLOAD_TYPES),
  size: z.number().int().positive().max(MAX_UPLOAD_BYTES),
  shipmentId: z.string().uuid().optional(),
});

export const shipmentCreateSchema = z.object({
  organizationId: z.string().uuid().optional(),
  reference: z.string().trim().min(1).max(120),
  origin: z.string().trim().max(120).optional().default(""),
  destination: z.string().trim().max(120).optional().default(""),
});

const evidenceField = z.object({
  value: z.union([z.string(), z.number(), z.null()]),
  confidence: z.number().min(0).max(1),
  evidence: z.string().max(1200).default(""),
});

export const invoiceDataSchema = z.object({
  supplier_name: evidenceField,
  supplier_bin: evidenceField,
  invoice_number: evidenceField,
  po_number: evidenceField.default({ value: null, confidence: 0, evidence: "" }),
  invoice_date: evidenceField,
  currency: evidenceField,
  subtotal: evidenceField,
  vat: evidenceField,
  total: evidenceField,
  line_items: z.array(z.object({
    description: z.string().max(500),
    quantity: z.number().nullable(),
    unit_price: z.number().nullable(),
    amount: z.number().nullable(),
    confidence: z.number().min(0).max(1),
    evidence: z.string().max(1200),
  })).max(500),
});

export const documentPatchSchema = z.object({
  extracted: invoiceDataSchema,
  action: z.enum(["save", "approve"]).default("save"),
});
