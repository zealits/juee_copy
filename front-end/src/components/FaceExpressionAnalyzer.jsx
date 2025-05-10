"use client"

import { useState, useEffect, useRef } from "react"
import { detectExpressions, getDominantExpression, getExpressionEmoji, getExpressionColor } from "../utils/faceApiUtils"

const FaceExpressionAnalyzer = ({ videoRef, isActive = false }) => {
  const [expression, setExpression] = useState(null)
  const [confidence, setConfidence] = useState(0)
  const animationRef = useRef(null)

  useEffect(() => {
    let isMounted = true

    const analyzeExpression = async () => {
      if (!videoRef.current || !isActive) return

      const result = await detectExpressions(videoRef.current)

      if (result && isMounted) {
        const dominantExpression = getDominantExpression(result.expressions)
        const expressionConfidence = result.expressions[dominantExpression] * 100

        setExpression(dominantExpression)
        setConfidence(Math.round(expressionConfidence))
      }

      if (isMounted) {
        animationRef.current = requestAnimationFrame(analyzeExpression)
      }
    }

    if (isActive) {
      analyzeExpression()
    }

    return () => {
      isMounted = false
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [videoRef, isActive])

  if (!expression) return null

  const expressionColor = getExpressionColor(expression)
  const expressionEmoji = getExpressionEmoji(expression)

  return (
    <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm text-white px-3 py-1.5 rounded-lg">
      <span className="text-lg">{expressionEmoji}</span>
      <div className="flex flex-col">
        <span className="text-xs font-medium capitalize">{expression}</span>
        <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full ${expressionColor} transition-all duration-300`}
            style={{ width: `${confidence}%` }}
          />
        </div>
      </div>
    </div>
  )
}

export default FaceExpressionAnalyzer

