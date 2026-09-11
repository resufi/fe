import css from "./HeroSkeleton.module.css";

export const HeroSkeleton = () => {
	return (
		<div className={css.wrap} aria-busy="true" aria-label="Loading pool">
			<div className={css.hero}>
				<div className={css.wf}>
					<div className={css.line} style={{ width: "260px" }} />

					<div className={css.stack}>
						<div className={css.band} />
						<div className={css.band} />
						<div className={css.band} />
					</div>

					<div>
						<div className={css.bar} />
						<div
							className={css.line}
							style={{ width: "60%", marginTop: "var(--s2)" }}
						/>
					</div>
				</div>

				{/* Панель позиций сюда не входит: она есть только у того, кто уже
			    вложился, и заглушка обещала бы блок, который часто не придёт. */}
			<div className={css.side}>
					<div className={css.panel}>
						<div className={css.line} style={{ width: "55%" }} />
						<div className={css.input} />
						<div className={css.button} />
						<div className={css.line} style={{ width: "70%" }} />
					</div>
				</div>
			</div>

			<div className={css.details}>
				<div className={css.line} style={{ width: "190px" }} />
			</div>
		</div>
	);
};
