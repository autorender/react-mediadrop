import { useMediaDrop } from "react-mediadrop";
import { useMemo } from "react";

const baseStyle: React.CSSProperties = {
	borderRadius: "var(--blume-radius)" as string,
	padding: "2.5rem 1.5rem",
	textAlign: "center",
	cursor: "pointer",
	color: "var(--blume-muted-foreground)" as string,
	border: "2px dashed var(--blume-border)",
	transition: "border-color 120ms ease, background 120ms ease",
};

export default function StylingExample() {
	const { getRootProps, getInputProps, isFocused, isDragAccept, isDragReject } = useMediaDrop({
		restrictions: { accept: ["image/*"] },
	});

	const style = useMemo<React.CSSProperties>(() => {
		if (isDragAccept) return { ...baseStyle, borderColor: "#12b76a", background: "rgba(18,183,106,0.08)" };
		if (isDragReject) return { ...baseStyle, borderColor: "#e5484d", background: "rgba(229,72,77,0.08)" };
		if (isFocused) return { ...baseStyle, borderColor: "var(--blume-accent)" };
		return baseStyle;
	}, [isFocused, isDragAccept, isDragReject]);

	return (
		<div {...getRootProps({ style })}>
			<input {...getInputProps()} />
			<p>Drag an image here, or click to browse</p>
			<em>getRootProps() sets no className or style of its own — this border is ours</em>
		</div>
	);
}
