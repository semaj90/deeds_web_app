import { z } from 'zod';

export const CROSS_ENCODER_CALIBRATION_SCHEMA_V1 = 'atlas.cross-encoder-calibration.v1' as const;

export const CrossEncoderCalibrationConfigV1Schema = z
	.object({
		schema: z.literal(CROSS_ENCODER_CALIBRATION_SCHEMA_V1).default(CROSS_ENCODER_CALIBRATION_SCHEMA_V1),
		calibrationRevision: z.string().min(1),
		modelRevision: z.string().min(1),
		tokenizerRevision: z.string().min(1),
		maxLength: z.number().int().positive(),
		temperature: z.number().positive().default(1.0),
		centerBias: z.number().finite().default(0.0),
	})
	.strict();

export type CrossEncoderCalibrationConfigV1 = z.infer<typeof CrossEncoderCalibrationConfigV1Schema>;

export const CalibratedCrossEncoderResultV1Schema = z
	.object({
		rawLogit: z.number().finite(),
		calibratedScore: z.number().finite().min(0).max(1),
		calibrationRevision: z.string().min(1),
		modelRevision: z.string().min(1),
		tokenizerRevision: z.string().min(1),
		maxLength: z.number().int().positive(),
		latencyMs: z.number().finite().nonnegative().optional(),
		peakVramMb: z.number().finite().nonnegative().optional(),
	})
	.strict();

export type CalibratedCrossEncoderResultV1 = z.infer<typeof CalibratedCrossEncoderResultV1Schema>;

/**
 * Numerically stable sigmoid calibration.
 * Maps arbitrary raw cross-encoder logits into [0, 1] probability mass
 * under explicit temperature and calibration revision lineage.
 */
export function sigmoidCalibrate(logit: number, temperature = 1.0, bias = 0.0): number {
	if (!Number.isFinite(logit)) {
		throw new Error('RAW_LOGIT_NOT_FINITE');
	}
	const z = (logit - bias) / temperature;
	if (z >= 40) return 1.0;
	if (z <= -40) return 0.0;
	return 1.0 / (1.0 + Math.exp(-z));
}

export function calibrateCrossEncoderLogitV1(input: {
	rawLogit: number;
	config: CrossEncoderCalibrationConfigV1;
	latencyMs?: number;
	peakVramMb?: number;
}): CalibratedCrossEncoderResultV1 {
	const validConfig = CrossEncoderCalibrationConfigV1Schema.parse(input.config);
	const calibrated = sigmoidCalibrate(input.rawLogit, validConfig.temperature, validConfig.centerBias);

	return CalibratedCrossEncoderResultV1Schema.parse({
		rawLogit: input.rawLogit,
		calibratedScore: Number(calibrated.toFixed(6)),
		calibrationRevision: validConfig.calibrationRevision,
		modelRevision: validConfig.modelRevision,
		tokenizerRevision: validConfig.tokenizerRevision,
		maxLength: validConfig.maxLength,
		latencyMs: input.latencyMs,
		peakVramMb: input.peakVramMb,
	});
}
