/**
 * @openapi
 * components:
 *   schemas:
 *     SpeakingUserConfig:
 *       type: object
 *       properties:
 *         scenario:
 *           type: string
 *           example: "job_interview"
 *         level:
 *           type: string
 *           example: "B1"
 *         userRole:
 *           type: string
 *           example: "candidate"
 *         botTone:
 *           type: string
 *           example: "friendly"
 *         goal:
 *           type: string
 *           example: "Improve fluency and pronunciation in job interviews"
 *         durationMinutes:
 *           type: integer
 *           example: 15
 *         botSpeed:
 *           type: string
 *           enum: ["slow", "normal", "fast"]
 *           example: "normal"
 *       required:
 *         - scenario
 *         - level
 *         - userRole
 *         - botTone
 *         - goal
 *         - durationMinutes
 *         - botSpeed
 *
 *     SpeakingMistake:
 *       type: object
 *       properties:
 *         original:
 *           type: string
 *           example: "pronounciation"
 *         correction:
 *           type: string
 *           example: "pronunciation"
 *         type:
 *           type: string
 *           enum: ["grammar", "vocabulary", "pronunciation"]
 *           example: "pronunciation"
 *         explanation:
 *           type: string
 *           example: "The stress should be on 'nun', not 'noun'."
 *       required:
 *         - original
 *         - correction
 *         - type
 *
 *     SpeakingFeedback:
 *       type: object
 *       properties:
 *         pronunciationScore:
 *           type: number
 *           example: 85
 *         fluencyScore:
 *           type: number
 *           example: 80
 *         intonationScore:
 *           type: number
 *           example: 78
 *         grammarScore:
 *           type: number
 *           example: 82
 *         totalScore:
 *           type: number
 *           example: 81
 *         improvementTip:
 *           type: string
 *           example: "Try to slow down slightly and pay attention to word stress."
 *         mistakes:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/SpeakingMistake'
 *       required:
 *         - pronunciationScore
 *         - fluencyScore
 *         - intonationScore
 *         - grammarScore
 *         - totalScore
 *
 *     SpeakingTurnResponse:
 *       type: object
 *       properties:
 *         feedback:
 *           $ref: '#/components/schemas/SpeakingFeedback'
 *         botText:
 *           type: string
 *           example: "Thanks for sharing! Your pronunciation is generally clear. Let's keep practicing."
 *         botTranslation:
 *           type: string
 *           example: "Cảm ơn bạn, phát âm của bạn nhìn chung khá rõ. Hãy tiếp tục luyện tập nhé."
 *         userTranscript:
 *           type: string
 *           example: "Today I went to the park and practiced speaking English."
 *         userTranslation:
 *           type: string
 *           example: "Hôm nay mình đã đi công viên và luyện nói tiếng Anh."
 *         isUnintelligible:
 *           type: boolean
 *           example: false
 *
 *     SpeakingCreateSessionRequest:
 *       type: object
 *       properties:
 *         title:
 *           type: string
 *           example: "Practice speaking - Job Interview"
 *         config:
 *           $ref: '#/components/schemas/SpeakingUserConfig'
 *       required:
 *         - title
 *         - config
 *
 *     SpeakingTurnRequest:
 *       type: object
 *       properties:
 *         sessionId:
 *           type: string
 *           example: "67381c1e0b5a5c5b2a9d3f12"
 *         audioBase64:
 *           type: string
 *           description: "Base64 encoded audio from client (optional, reserved for future Python integration)"
 *         userTranscript:
 *           type: string
 *           description: "Transcript of user's speech detected on client or backend"
 *           example: "I would like to apply for the position of software engineer."
 *       required:
 *         - sessionId
 *
 *     SpeakingTurnResponseWrapper:
 *       type: object
 *       properties:
 *         turn:
 *           $ref: '#/components/schemas/SpeakingTurnResponse'
 *         userMessageId:
 *           type: string
 *           example: "67381c5e0b5a5c5b2a9d3f15"
 *         botMessageId:
 *           type: string
 *           example: "67381c5e0b5a5c5b2a9d3f16"
 */
